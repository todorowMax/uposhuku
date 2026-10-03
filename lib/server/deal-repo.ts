// lib/server/deal-repo.ts
//
// Угоди на D1. Угода — документ (JSON з етапами), бо машина станів
// (lib/deals/machine.ts) працює з усім об'єктом.

import { and, desc, eq } from "drizzle-orm";
import { deals } from "@/db/schema";
import { applyAction, applyPerformerAction, createDeal, validateDraft } from "@/lib/deals/machine";
import type { Deal, DealAction, DealDraft, PerformerAction } from "@/lib/deals/types";
import { conversations } from "@/db/schema";
import { getDb } from "./db";

const parse = (row: typeof deals.$inferSelect) => JSON.parse(row.data) as Deal;

const write = async (ownerUserId: string, deal: Deal, now: number) => {
  await getDb()
    .update(deals)
    .set({ status: deal.status, data: JSON.stringify(deal), updatedAt: now })
    .where(and(eq(deals.id, deal.id), eq(deals.ownerUserId, ownerUserId)));
};

const readAll = async (userId: string): Promise<Deal[]> =>
  (await getDb().select().from(deals).where(eq(deals.ownerUserId, userId)).orderBy(desc(deals.createdAt))).map(parse);

export const listDeals = async (userId: string, requestId?: string): Promise<Deal[]> =>
  (await readAll(userId)).filter((deal) => !requestId || deal.requestId === requestId);

export const proposeDeal = async (userId: string, draft: DealDraft, now = Date.now()): Promise<Deal | string> => {
  const error = validateDraft(draft);
  if (error) return error;
  const existing = await readAll(userId);
  // На один відгук одна жива угода: нову можна після відмови чи скасування.
  if (existing.some((deal) => deal.responseId === draft.responseId && deal.status !== "declined" && deal.status !== "cancelled")) return "З цим виконавцем уже є угода.";
  const deal = createDeal(`deal_${crypto.randomUUID().slice(0, 8)}`, draft, now);
  await getDb().insert(deals).values({
    id: deal.id,
    ownerUserId: userId,
    requestId: deal.requestId,
    responseId: deal.responseId,
    performerId: deal.performer.id,
    status: deal.status,
    data: JSON.stringify(deal),
    createdAt: now,
    updatedAt: now,
  });
  return deal;
};

export const actOnDeal = async (userId: string, id: string, action: DealAction, stageId: string | undefined, now = Date.now()): Promise<Deal | string | null> => {
  const deal = (await readAll(userId)).find((item) => item.id === id);
  if (!deal) return null;
  const result = applyAction(deal, action, stageId, now);
  if (typeof result === "string") return result;
  await write(userId, result, now);
  return result;
};

// ───────────── сторона виконавця ─────────────

/** Угоди, запропоновані цьому виконавцю-акаунту; можна звузити до розмови з одним замовником. */
export const listDealsForPerformer = async (performerUserId: string, conversationId?: string): Promise<Deal[]> => {
  const db = getDb();
  let owner: string | undefined;
  if (conversationId) {
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.performerUserId, performerUserId))).limit(1);
    if (!conversation) return [];
    owner = conversation.customerUserId;
  }
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.performerId, `me-${performerUserId}`), ...(owner ? [eq(deals.ownerUserId, owner)] : [])))
    .orderBy(desc(deals.createdAt));
  return rows.map(parse);
};

export const actAsPerformer = async (performerUserId: string, id: string, action: PerformerAction, stageId: string | undefined, now = Date.now()): Promise<Deal | string | null> => {
  const [row] = await getDb().select().from(deals).where(and(eq(deals.id, id), eq(deals.performerId, `me-${performerUserId}`))).limit(1);
  if (!row) return null;
  const result = applyPerformerAction(parse(row), action, stageId, now);
  if (typeof result === "string") return result;
  await write(row.ownerUserId, result, now);
  return result;
};
