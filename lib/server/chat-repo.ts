// lib/server/chat-repo.ts
//
// Розмови й повідомлення на D1. Реальний час — опитування `?since=` раз на
// кілька секунд; Durable Object з WebSocket підключимо поверх тих самих
// таблиць, цей API лишиться запасним.

import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import { conversations, deals, messages, users } from "@/db/schema";
import type { Deal } from "@/lib/deals/types";
import { performerNeeds } from "@/lib/deals/machine";
import type { ChatMessageDto, ConversationDto } from "@/lib/chat/types";
import { getDb, inChunks } from "./db";
import { getProfile } from "./profile-repo";

type Conversation = typeof conversations.$inferSelect;

const toMessage = (row: typeof messages.$inferSelect): ChatMessageDto => ({ id: row.id, from: row.from, text: row.text, at: new Date(row.createdAt).toISOString() });

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

export const listMessages = async (conversationId: string, sinceMs = 0): Promise<ChatMessageDto[]> =>
  (await getDb().select().from(messages).where(and(eq(messages.conversationId, conversationId), gt(messages.createdAt, sinceMs))).orderBy(asc(messages.createdAt)).limit(500)).map(toMessage);

export const addMessage = async (conversationId: string, from: "customer" | "performer", text: string): Promise<ChatMessageDto> => {
  const db = getDb();
  const now = Date.now();
  const row = { id: `msg_${crypto.randomUUID().slice(0, 10)}`, conversationId, from, text, createdAt: now };
  await db.batch([db.insert(messages).values(row), db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId))]);
  return toMessage(row);
};

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
    if (dealRow) {
      const parsed = JSON.parse(dealRow.data) as Deal;
      const needs = role === "performer" ? performerNeeds(parsed) !== null : false;
      const label = parsed.status === "completed" ? "Угоду завершено" : parsed.status === "proposed" ? (role === "performer" ? "Пропонує угоду" : "Угоду запропоновано") : "Угода в роботі";
      deal = { label, needsMe: needs };
    }
    result.push({ id: row.id, performerId: row.performerId, role, other, lastMessage: last ? toMessage(last) : null, ...(deal ? { deal } : {}), updatedAt: new Date(row.updatedAt).toISOString() });
  }
  return result;
};
