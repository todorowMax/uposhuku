// lib/server/chat-repo.ts
//
// Розмови й повідомлення на D1. Реальний час — опитування `?since=` раз на
// кілька секунд; Durable Object з WebSocket підключимо поверх тих самих
// таблиць, цей API лишиться запасним.

import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { chatAttachments, conversations, deals, messages, requests, responses, users } from "@/db/schema";
import { DELETED_NAME } from "@/lib/account/deletion";
import type { Deal } from "@/lib/deals/types";
import { needsAction, performerNeeds } from "@/lib/deals/machine";
import type { ChatMessageDto, ConversationDto } from "@/lib/chat/types";
import { newId } from "@/lib/ids";
import { getDb, inChunks } from "./db";
import { getProfile, getProfileCards } from "./profile-repo";
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
  await db.insert(conversations).values({ id: newId("conv"), customerUserId, performerId, performerUserId, createdAt: now, updatedAt: now }).onConflictDoNothing();
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

/** Чи видалив акаунт співрозмовник: писати йому й виставляти умови більше не можна. */
export const otherSideGone = async (conversation: Conversation, role: "customer" | "performer"): Promise<boolean> => {
  const otherId = role === "customer" ? conversation.performerUserId : conversation.customerUserId;
  if (!otherId) return false;
  const [row] = await getDb().select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, otherId)).limit(1);
  return row?.deletedAt != null;
};

/** Відповідь для людини, коли співрозмовник видалив акаунт. */
export const OTHER_SIDE_GONE = "Співрозмовник видалив акаунт. Писати йому більше не можна.";

const attachmentsOf = async (messageIds: string[]) => {
  if (messageIds.length === 0) return [];
  return inChunks(messageIds, (chunk) => getDb().select({ id: chatAttachments.id, messageId: chatAttachments.messageId }).from(chatAttachments).where(inArray(chatAttachments.messageId, chunk)));
};

const MESSAGES_PAGE = 500;

/**
 * Перше завантаження (since = 0) віддає останні 500 повідомлень (спершу беремо найновіші, потім розвертаємо),
 * щоб довга розмова не показувала лише початок. Опитування (since > 0) читає зростаюче від мітки, як і раніше:
 * так жодне нове повідомлення не губиться.
 */
export const listMessages = async (conversationId: string, sinceMs = 0): Promise<ChatMessageDto[]> => {
  const where = and(eq(messages.conversationId, conversationId), gt(messages.createdAt, sinceMs));
  const query = getDb().select().from(messages).where(where);
  const rows = sinceMs > 0 ? await query.orderBy(asc(messages.createdAt)).limit(MESSAGES_PAGE) : (await query.orderBy(desc(messages.createdAt)).limit(MESSAGES_PAGE)).reverse();
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

/**
 * Останнє повідомлення кожної розмови: один запит на порцію. Підзапит бере id найновішого за індексом
 * `messages_conversation_idx` (розмова, час). Якщо в розмові два повідомлення з однаковим часом,
 * останнім вважаємо те, чий id більший (тож результат завжди однаковий).
 */
const lastMessages = async (conversationIds: string[], textOnly = false): Promise<Map<string, typeof messages.$inferSelect>> => {
  const humanOnly = textOnly ? sql` and m2.kind = 'text'` : sql``;
  const rows = await inChunks(conversationIds, (chunk) =>
    getDb()
      .select()
      .from(messages)
      .where(and(inArray(messages.conversationId, chunk), sql`${messages.id} = (select m2.id from messages m2 where m2.conversation_id = ${messages.conversationId}${humanOnly} order by m2.created_at desc, m2.id desc limit 1)`)),
  );
  return new Map(rows.map((row) => [row.conversationId, row]));
};

/** У яких розмовах хтось писав сам: системні рядки («Відгук на…», «Угоду запропоновано») не рахуємо. */
const talkedIn = async (conversationIds: string[]): Promise<Set<string>> => {
  const rows = await inChunks(conversationIds, (chunk) =>
    getDb()
      .selectDistinct({ id: messages.conversationId })
      .from(messages)
      .where(and(inArray(messages.conversationId, chunk), eq(messages.kind, "text"))),
  );
  return new Set(rows.map((row) => row.id));
};

/** Стеля лічильника в списку: далі «99» нічого не додає. */
export const UNREAD_CAP = 99;

/** Непрочитане мною в розмовах: текстові від другої сторони й службові рядки, новіші за мою мітку. Один запит на порцію. */
const unreadIn = async (conversationIds: string[], userId: string): Promise<Map<string, { texts: number; system: number }>> => {
  const mine = sql`case when ${conversations.customerUserId} = ${userId} then ${conversations.customerReadAt} else ${conversations.performerReadAt} end`;
  const otherSide = sql`case when ${conversations.customerUserId} = ${userId} then 'performer' else 'customer' end`;
  const rows = await inChunks(conversationIds, (chunk) =>
    getDb()
      .select({
        id: messages.conversationId,
        texts: sql<number>`sum(case when ${messages.kind} = 'text' and ${messages.from} = ${otherSide} then 1 else 0 end)`,
        system: sql<number>`sum(case when ${messages.kind} = 'system' then 1 else 0 end)`,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(inArray(messages.conversationId, chunk), sql`${messages.createdAt} > coalesce(${mine}, 0)`))
      .groupBy(messages.conversationId),
  );
  return new Map(rows.map((row) => [row.id, { texts: Number(row.texts), system: Number(row.system) }]));
};

/** Поля непрочитаного для рядка списку: лічильник текстів (зі стелею) і подія угоди, що чекає на мене. */
const unreadFields = (counts: { texts: number; system: number } | undefined, needsMe: boolean) => ({ unread: Math.min(counts?.texts ?? 0, UNREAD_CAP), unreadDeal: needsMe && (counts?.system ?? 0) > 0 });

/** Ставить мою мітку прочитання на «зараз»; мітка лише росте. */
export const markConversationRead = async (conversationId: string, role: "customer" | "performer", now = Date.now()): Promise<void> => {
  const column = role === "customer" ? conversations.customerReadAt : conversations.performerReadAt;
  const set = role === "customer" ? { customerReadAt: now } : { performerReadAt: now };
  await getDb().update(conversations).set(set).where(and(eq(conversations.id, conversationId), or(isNull(column), lt(column, now))));
};

type Offer = { customer: string; performer: string; text: string };

/**
 * Звідки діалог: найновіший відгук виконавця на запит замовника, окремо на пару. Умова обмежує і замовника,
 * і виконавця: або я замовник, а виконавці з моїх розмов, або я виконавець, а замовники з моїх розмов.
 */
const latestOffers = async (condition: (chunk: string[]) => ReturnType<typeof and>, ids: string[]): Promise<Offer[]> =>
  inChunks(ids, (chunk) =>
    getDb()
      .select({ customer: requests.userId, performer: responses.performerUserId, text: requests.text })
      .from(responses)
      .innerJoin(requests, eq(responses.requestId, requests.id))
      .where(and(condition(chunk), sql`${responses.id} = (select r2.id from responses r2 join requests q2 on q2.id = r2.request_id where q2.user_id = ${requests.userId} and r2.performer_user_id = ${responses.performerUserId} order by r2.created_at desc, r2.id desc limit 1)`)),
  );

/** Мої розмови в обох ролях, свіжі першими. Кількість запитів не залежить від числа розмов (порціями по 90 id). */
export const listConversations = async (userId: string): Promise<ConversationDto[]> => {
  const db = getDb();
  const rows = await db.select().from(conversations).where(or(eq(conversations.customerUserId, userId), eq(conversations.performerUserId, userId))).orderBy(desc(conversations.updatedAt)).limit(100);
  if (rows.length === 0) return [];
  const asCustomer = rows.filter((row) => row.customerUserId === userId);
  const asPerformer = rows.filter((row) => row.performerUserId === userId);
  const customerIds = [...new Set(asPerformer.map((row) => row.customerUserId))];
  const performerUserIds = [...new Set(asCustomer.flatMap((row) => (row.performerUserId ? [row.performerUserId] : [])))];
  const [lastById, lastHumanById, talked, unreadById, mine, people, cards, offersAsCustomer, offersAsPerformer] = await Promise.all([
    lastMessages(rows.map((row) => row.id)),
    lastMessages(rows.map((row) => row.id), true),
    talkedIn(rows.map((row) => row.id)),
    unreadIn(rows.map((row) => row.id), userId),
    db.select().from(deals).where(or(eq(deals.ownerUserId, userId), eq(deals.performerId, `me-${userId}`))).orderBy(desc(deals.createdAt)).limit(200),
    inChunks([...customerIds, ...performerUserIds], (chunk) => db.select({ id: users.id, displayName: users.displayName, deletedAt: users.deletedAt }).from(users).where(inArray(users.id, chunk))),
    getProfileCards(performerUserIds),
    latestOffers((chunk) => and(eq(requests.userId, userId), inArray(responses.performerUserId, chunk)), performerUserIds),
    latestOffers((chunk) => and(eq(responses.performerUserId, userId), inArray(requests.userId, chunk)), customerIds),
  ]);
  const liveDeals = mine.filter((row) => row.status !== "declined" && row.status !== "cancelled");
  const offerRows = [...offersAsCustomer, ...offersAsPerformer];
  const result: ConversationDto[] = [];
  for (const row of rows) {
    const role = row.customerUserId === userId ? "customer" : "performer";
    const last = lastById.get(row.id);
    const lastHuman = lastHumanById.get(row.id);
    let other: ConversationDto["other"];
    if (role === "customer") {
      const profile = row.performerUserId ? cards.get(row.performerUserId) : undefined;
      const gone = people.some((user) => user.id === row.performerUserId && user.deletedAt !== null);
      other = gone ? { name: DELETED_NAME } : { name: profile?.name ?? "Виконавець", photo: profile?.photo || undefined, specialty: profile?.specialty };
    } else {
      const customer = people.find((user) => user.id === row.customerUserId);
      const named = customer?.deletedAt == null && Boolean(customer?.displayName?.trim());
      other = { name: customer?.deletedAt != null ? DELETED_NAME : named ? (customer?.displayName as string) : "Замовник", ...(customer?.deletedAt == null && !named ? { nameless: true } : {}) };
    }
    const pairDeals = liveDeals.filter((item) => (role === "customer" ? item.ownerUserId === userId && item.performerId === row.performerId : item.performerId === `me-${userId}` && item.ownerUserId === row.customerUserId));
    let deal: ConversationDto["deal"];
    let phase: ConversationDto["phase"] = "chat";
    if (pairDeals.length > 0) {
      // Усі живі угоди пари, кожен рядок розбираємо один раз: підпис бере найважливішу (чекає на мене, потім незавершена, потім завершена).
      const summaries = pairDeals.map((item) => {
        const parsed = JSON.parse(item.data) as Deal;
        return { parsed, completed: item.status === "completed", needs: (role === "performer" ? performerNeeds(parsed) : needsAction(parsed)) !== null };
      });
      const main = summaries.find((item) => item.needs) ?? summaries.find((item) => !item.completed) ?? summaries[0];
      phase = summaries.every((item) => item.completed) ? "done" : "deal";
      const mine = main.parsed.proposedBy ? main.parsed.proposedBy === role : role === "customer";
      const label = main.parsed.status === "completed" ? "Угоду завершено" : main.parsed.status === "proposed" ? (mine ? "Угоду запропоновано" : "Пропонує угоду") : "Угода в роботі";
      deal = { label, needsMe: summaries.some((item) => item.needs) };
    }
    const offerRow = offerRows.find((item) => item.customer === row.customerUserId && item.performer === row.performerUserId);
    const offer = offerRow ? { title: offerRow.text.length > 40 ? `${offerRow.text.slice(0, 39).trimEnd()}…` : offerRow.text } : undefined;
    result.push({ id: row.id, performerId: row.performerId, role, other, lastMessage: last ? toMessage(last) : null, lastHumanMessage: lastHuman ? toMessage(lastHuman) : null, talked: talked.has(row.id), ...unreadFields(unreadById.get(row.id), Boolean(deal?.needsMe)), ...(deal ? { deal } : {}), phase, ...(offer ? { offer } : {}), updatedAt: new Date(row.updatedAt).toISOString() });
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

export const REQUEST_EDITED_NOTICE = "Замовник оновив запит";
/** Не частіше одного такого рядка в розмову за це вікно: серія швидких правок не засмічує чат. */
export const REQUEST_EDITED_NOTICE_WINDOW_MS = 10 * 60_000;

/**
 * Після правки запиту: службовий рядок «Замовник оновив запит» у кожну наявну розмову з виконавцем, що на нього
 * відгукнувся (без тексту змін). Нових розмов не створює; помилка запису не ламає саму правку.
 */
export const noteRequestEdited = async (customerUserId: string, requestId: string, now = Date.now()): Promise<void> => {
  try {
    const db = getDb();
    const talks = await db
      .select({ id: conversations.id, performerUserId: conversations.performerUserId })
      .from(conversations)
      .innerJoin(responses, and(eq(responses.performerUserId, conversations.performerUserId), eq(responses.requestId, requestId)))
      .where(eq(conversations.customerUserId, customerUserId));
    if (talks.length === 0) return;
    const recent = await inChunks(
      talks.map((talk) => talk.id),
      (chunk) =>
        db
          .select({ id: messages.conversationId })
          .from(messages)
          .where(and(inArray(messages.conversationId, chunk), eq(messages.kind, "system"), eq(messages.contextId, requestId), eq(messages.text, REQUEST_EDITED_NOTICE), gt(messages.createdAt, now - REQUEST_EDITED_NOTICE_WINDOW_MS))),
    );
    const skip = new Set(recent.map((row) => row.id));
    for (const talk of talks.filter((item) => !skip.has(item.id))) {
      await addMessage(talk.id, "customer", REQUEST_EDITED_NOTICE, { kind: "system", contextId: requestId });
      pushUser(customerUserId, { t: "message", conversationId: talk.id });
      if (talk.performerUserId) pushUser(talk.performerUserId, { t: "message", conversationId: talk.id });
    }
  } catch {
    // Службовий рядок лише зручність; сама правка вже збережена.
  }
};
