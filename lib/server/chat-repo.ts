// lib/server/chat-repo.ts
//
// Розмови й повідомлення на D1. Реальний час — опитування `?since=` раз на
// кілька секунд; Durable Object з WebSocket підключимо поверх тих самих
// таблиць, цей API лишиться запасним.

import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { chatAttachments, conversations, deals, messages, requests, responses, users } from "@/db/schema";
import type { Deal } from "@/lib/deals/types";
import { currentStage, dealTotal, needsAction, performerNeeds } from "@/lib/deals/machine";
import type { ChatMessageDto, ConversationDto, ConversationOrderDto } from "@/lib/chat/types";
import { getDb, inChunks } from "./db";
import { getProfile } from "./profile-repo";
import { pushUser } from "./realtime";
import { CHAT_PHOTOS_PER_CONVERSATION, CHAT_PHOTO_BYTES_PER_CONVERSATION, getBucket, putChatPhoto } from "./uploads";

type Conversation = typeof conversations.$inferSelect;

const attachmentUrl = (conversationId: string, id: string) => `/api/conversations/${conversationId}/attachments/${id}`;

const toMessage = (row: typeof messages.$inferSelect, attachments: { id: string }[] = []): ChatMessageDto => ({
  id: row.id,
  from: row.from,
  text: row.text,
  at: new Date(row.createdAt).toISOString(),
  ...(row.kind === "system" ? { kind: "system" as const } : {}),
  ...(row.contextId ? { contextId: row.contextId } : {}),
  ...(attachments.length ? { attachments: attachments.map((item) => ({ id: item.id, url: attachmentUrl(row.conversationId, item.id) })) } : {}),
});

/** З ким можна говорити: опублікований профіль іншого акаунта (id виду me-<userId>). */
export const performerKnown = async (performerId: string, selfUserId: string): Promise<{ userId: string } | null> => {
  if (!performerId.startsWith("me-")) return null;
  const userId = performerId.slice(3);
  if (!userId || userId === selfUserId) return null;
  const profile = await getProfile(userId);
  return profile?.published ? { userId } : null;
};

export const getOrCreateConversation = async (customerUserId: string, performerId: string, performerUserId: string): Promise<Conversation> => {
  const db = getDb();
  const find = async () => (await db.select().from(conversations).where(and(eq(conversations.customerUserId, customerUserId), eq(conversations.performerId, performerId))).limit(1))[0];
  const existing = await find();
  if (existing) return existing;
  const now = Date.now();
  await db.insert(conversations).values({ id: `conv_${crypto.randomUUID().slice(0, 8)}`, customerUserId, performerId, performerUserId, createdAt: now, updatedAt: now }).onConflictDoNothing();
  return (await find()) as Conversation;
};

/** Розмова, до якої людина має доступ (замовник або виконавець), і її роль. */
export const accessibleConversation = async (conversationId: string, userId: string): Promise<{ conversation: Conversation; role: "customer" | "performer" } | null> => {
  const [row] = await getDb().select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!row) return null;
  if (row.customerUserId === userId) return { conversation: row, role: "customer" };
  if (row.performerUserId === userId) return { conversation: row, role: "performer" };
  return null;
};

const attachmentsOf = async (messageIds: string[]) => {
  if (messageIds.length === 0) return [];
  return inChunks(messageIds, (chunk) => getDb().select({ id: chatAttachments.id, messageId: chatAttachments.messageId }).from(chatAttachments).where(inArray(chatAttachments.messageId, chunk)));
};

export const listMessages = async (conversationId: string, sinceMs = 0): Promise<ChatMessageDto[]> => {
  const rows = await getDb().select().from(messages).where(and(eq(messages.conversationId, conversationId), gt(messages.createdAt, sinceMs))).orderBy(asc(messages.createdAt)).limit(500);
  const files = await attachmentsOf(rows.map((row) => row.id));
  return rows.map((row) => toMessage(row, files.filter((file) => file.messageId === row.id)));
};

export const addMessage = async (conversationId: string, from: "customer" | "performer", text: string, extra: { kind?: "text" | "system"; contextId?: string; attachmentIds?: string[] } = {}): Promise<ChatMessageDto> => {
  const db = getDb();
  const now = Date.now();
  const row = { id: `msg_${crypto.randomUUID().slice(0, 10)}`, conversationId, from, text, kind: extra.kind ?? "text", contextId: extra.contextId ?? null, createdAt: now };
  const ids = extra.attachmentIds ?? [];
  await db.batch([
    db.insert(messages).values(row),
    db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId)),
    ...(ids.length ? [db.update(chatAttachments).set({ messageId: row.id }).where(and(inArray(chatAttachments.id, ids), eq(chatAttachments.conversationId, conversationId), isNull(chatAttachments.messageId)))] : []),
  ]);
  return toMessage(row, ids.map((id) => ({ id })));
};

/** Які з переданих фото справді мої, з цієї розмови й ще не прикріплені. */
export const claimableAttachments = async (conversationId: string, userId: string, ids: string[]): Promise<string[]> => {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select({ id: chatAttachments.id })
    .from(chatAttachments)
    .where(and(inArray(chatAttachments.id, ids), eq(chatAttachments.conversationId, conversationId), eq(chatAttachments.uploaderUserId, userId), isNull(chatAttachments.messageId)));
  return rows.map((row) => row.id);
};

/**
 * Приймає фото в розмову: перевіряє стелю за кількістю й вагою, прибирає свої
 * «осиротілі» (не прикріплені понад добу) і кладе нове в R2.
 */
export const saveChatPhoto = async (conversationId: string, userId: string, bytes: Uint8Array): Promise<{ id: string; url: string } | string> => {
  const db = getDb();
  const now = Date.now();
  const stale = await db.select().from(chatAttachments).where(and(eq(chatAttachments.conversationId, conversationId), isNull(chatAttachments.messageId), lt(chatAttachments.createdAt, now - 24 * 3600_000)));
  if (stale.length) {
    await getBucket().delete(stale.map((row) => row.key));
    await db.delete(chatAttachments).where(inArray(chatAttachments.id, stale.map((row) => row.id)));
  }
  const [usage] = await db.select({ count: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${chatAttachments.bytes}), 0)` }).from(chatAttachments).where(eq(chatAttachments.conversationId, conversationId));
  if ((usage?.count ?? 0) >= CHAT_PHOTOS_PER_CONVERSATION || (usage?.bytes ?? 0) + bytes.length > CHAT_PHOTO_BYTES_PER_CONVERSATION) return "У цій розмові вже забагато фото.";
  const stored = await putChatPhoto(conversationId, bytes);
  if (typeof stored === "string") return stored;
  const id = `att_${crypto.randomUUID().slice(0, 12)}`;
  await db.insert(chatAttachments).values({ id, conversationId, uploaderUserId: userId, key: stored.key, mime: stored.mime, bytes: stored.bytes, createdAt: now });
  return { id, url: attachmentUrl(conversationId, id) };
};

export const findChatAttachment = async (conversationId: string, id: string) =>
  (await getDb().select().from(chatAttachments).where(and(eq(chatAttachments.id, id), eq(chatAttachments.conversationId, conversationId))).limit(1))[0] ?? null;

/** Мої розмови в обох ролях, свіжі першими. */
export const listConversations = async (userId: string): Promise<ConversationDto[]> => {
  const db = getDb();
  const rows = await db.select().from(conversations).where(or(eq(conversations.customerUserId, userId), eq(conversations.performerUserId, userId))).orderBy(desc(conversations.updatedAt)).limit(100);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const allMessages = (await inChunks(ids, (chunk) => db.select().from(messages).where(inArray(messages.conversationId, chunk)))).sort((a, b) => b.createdAt - a.createdAt);
  const mine = (await db.select().from(deals).where(or(eq(deals.ownerUserId, userId), eq(deals.performerId, `me-${userId}`))).orderBy(desc(deals.createdAt)).limit(200)).filter((row) => row.status !== "declined" && row.status !== "cancelled");
  const customerIds = [...new Set(rows.filter((row) => row.performerUserId === userId).map((row) => row.customerUserId))];
  const customers = await inChunks(customerIds, (chunk) => db.select().from(users).where(inArray(users.id, chunk)));
  // Відгуки між цими людьми: звідки діалог (виконавець відгукнувся на запит замовника).
  const customerOf = [...new Set(rows.map((row) => row.customerUserId))];
  const offerRows = await inChunks(customerOf, (chunk) =>
    db
      .select({ customer: requests.userId, performer: responses.performerUserId, text: requests.text, at: responses.createdAt })
      .from(responses)
      .innerJoin(requests, eq(responses.requestId, requests.id))
      .where(inArray(requests.userId, chunk)),
  );
  offerRows.sort((a, b) => b.at - a.at);
  const result: ConversationDto[] = [];
  for (const row of rows) {
    const role = row.customerUserId === userId ? "customer" : "performer";
    const last = allMessages.find((message) => message.conversationId === row.id);
    let other: ConversationDto["other"];
    if (role === "customer") {
      const profile = row.performerUserId ? await getProfile(row.performerUserId) : null;
      other = { name: profile?.name ?? "Виконавець", photo: profile?.photo || undefined, specialty: profile?.specialty };
    } else {
      const customer = customers.find((user) => user.id === row.customerUserId);
      other = { name: customer?.displayName ?? customer?.email.split("@")[0] ?? "Замовник" };
    }
    const dealRow = mine.find((item) => (role === "customer" ? item.ownerUserId === userId && item.performerId === row.performerId : item.performerId === `me-${userId}` && item.ownerUserId === row.customerUserId));
    let deal: ConversationDto["deal"];
    let phase: ConversationDto["phase"] = "chat";
    if (dealRow) {
      phase = dealRow.status === "completed" ? "done" : "deal";
      const parsed = JSON.parse(dealRow.data) as Deal;
      const needs = role === "performer" ? performerNeeds(parsed) !== null : needsAction(parsed) !== null;
      const mine = parsed.proposedBy ? parsed.proposedBy === role : role === "customer";
      const label = parsed.status === "completed" ? "Угоду завершено" : parsed.status === "proposed" ? (mine ? "Угоду запропоновано" : "Пропонує угоду") : "Угода в роботі";
      deal = { label, needsMe: needs };
    }
    const offerRow = offerRows.find((item) => item.customer === row.customerUserId && item.performer === row.performerUserId);
    const offer = offerRow ? { title: offerRow.text.length > 40 ? `${offerRow.text.slice(0, 39).trimEnd()}…` : offerRow.text } : undefined;
    result.push({ id: row.id, performerId: row.performerId, role, other, lastMessage: last ? toMessage(last) : null, ...(deal ? { deal } : {}), phase, ...(offer ? { offer } : {}), updatedAt: new Date(row.updatedAt).toISOString() });
  }
  return result;
};

/**
 * Подія в стрічці спільної розмови пари («Угоду запропоновано»). Розмову створює,
 * якщо її ще не було; помилка запису не має ламати дію, яка її викликала.
 */
export const addSystemMessage = async (customerUserId: string, performerUserId: string, text: string, contextId: string): Promise<void> => {
  try {
    const conversation = await getOrCreateConversation(customerUserId, `me-${performerUserId}`, performerUserId);
    await addMessage(conversation.id, "customer", text, { kind: "system", contextId });
    pushUser(customerUserId, { t: "message", conversationId: conversation.id });
    pushUser(performerUserId, { t: "message", conversationId: conversation.id });
  } catch {
    // Стрічка — лише зручність; сама дія вже виконана.
  }
};

const STATE_TEXT: Record<string, string> = {
  pending: "чекаємо оплату",
  claimed: "оплату позначено",
  funded: "оплачено, у роботі",
  delivered: "здано, чекає підтвердження",
  released: "виплачено",
  disputed: "спір",
  refunded: "кошти повернено",
};

/** Угоди пари з назвою запиту: що зараз і чи чекає це на мене. */
export const listConversationOrders = async (conversation: Conversation, role: "customer" | "performer"): Promise<ConversationOrderDto[]> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.ownerUserId, conversation.customerUserId), eq(deals.performerId, conversation.performerId)))
    .orderBy(desc(deals.createdAt))
    .limit(30);
  const live = rows.filter((row) => row.status !== "declined" && row.status !== "cancelled");
  if (live.length === 0) return [];
  const titles = await inChunks([...new Set(live.map((row) => row.requestId))], (chunk) => db.select({ id: requests.id, text: requests.text }).from(requests).where(inArray(requests.id, chunk)));
  return live.map((row) => {
    const deal = JSON.parse(row.data) as Deal;
    const stage = currentStage(deal);
    const raw = deal.title ?? titles.find((item) => item.id === row.requestId)?.text ?? "Замовлення";
    const title = raw.length > 48 ? `${raw.slice(0, 47).trimEnd()}…` : raw;
    const mineProposal = deal.proposedBy ? deal.proposedBy === role : role === "customer";
    const state = deal.status === "proposed" ? (mineProposal ? "чекає відповіді" : "пропонує умови") : deal.status === "completed" ? "завершено" : stage ? `${stage.title}: ${STATE_TEXT[stage.status] ?? stage.status}` : "у роботі";
    return {
      dealId: deal.id,
      number: deal.number,
      title,
      total: dealTotal(deal),
      status: deal.status === "completed" ? "completed" : deal.status === "proposed" ? "proposed" : "accepted",
      state,
      needsMe: role === "performer" ? performerNeeds(deal) !== null : needsAction(deal) !== null,
      mineProposal,
      direct: Boolean(deal.conversationId),
    };
  });
};
