// lib/server/deal-repo.ts
//
// Угоди на D1. Угода — документ (JSON з етапами), бо машина станів
// (lib/deals/machine.ts) працює з усім об'єктом. Виконавець у заглушці
// «відповідає» за таймером: стан доводимо до «зараз» при кожному читанні й
// зберігаємо, якщо він змінився.

import { and, desc, eq } from "drizzle-orm";
import { deals } from "@/db/schema";
import { applyAction, createDeal, simulate, validateDraft } from "@/lib/deals/machine";
import type { Deal, DealAction, DealDraft } from "@/lib/deals/types";
import { getDb } from "./db";

const parse = (row: typeof deals.$inferSelect) => JSON.parse(row.data) as Deal;

const write = async (ownerUserId: string, deal: Deal, now: number) => {
  await getDb()
    .update(deals)
    .set({ status: deal.status, data: JSON.stringify(deal), updatedAt: now })
    .where(and(eq(deals.id, deal.id), eq(deals.ownerUserId, ownerUserId)));
};

const readAll = async (userId: string, now: number): Promise<Deal[]> => {
  const rows = await getDb().select().from(deals).where(eq(deals.ownerUserId, userId)).orderBy(desc(deals.createdAt));
  const result: Deal[] = [];
  for (const row of rows) {
    const before = parse(row);
    const after = simulate(before, now);
    if (JSON.stringify(after) !== row.data) await write(userId, after, now);
    result.push(after);
  }
  return result;
};

export const listDeals = async (userId: string, requestId?: string, now = Date.now()): Promise<Deal[]> =>
  (await readAll(userId, now)).filter((deal) => !requestId || deal.requestId === requestId);

export const proposeDeal = async (userId: string, draft: DealDraft, now = Date.now()): Promise<Deal | string> => {
  const error = validateDraft(draft);
  if (error) return error;
  const existing = await readAll(userId, now);
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
  const deal = (await readAll(userId, now)).find((item) => item.id === id);
  if (!deal) return null;
  const result = applyAction(deal, action, stageId, now);
  if (typeof result === "string") return result;
  await write(userId, result, now);
  return result;
};
