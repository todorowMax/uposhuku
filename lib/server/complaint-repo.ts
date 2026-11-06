// lib/server/complaint-repo.ts
//
// Скарги сторін на прямі угоди (D1). Скарга не чіпає ні угоду, ні гроші: вона лише лежить у черзі модератора.
// Подати може замовник або виконавець угоди; чужому угода «не знайдена».

import { and, desc, eq } from "drizzle-orm";
import { dealComplaints } from "@/db/schema";
import { checkComplaint, complaintStageError } from "@/lib/deals/complaints";
import type { Deal } from "@/lib/deals/types";
import { getDb } from "./db";
import { getDealById, ownerOfDeal } from "./deal-repo";

export type StoredComplaint = typeof dealComplaints.$inferSelect;

/** Відповідь на другу відкриту скаргу від тієї самої сторони на той самий етап. */
export const COMPLAINT_DUPLICATE = "Ви вже подали скаргу на цей етап. Її ще не розглянуто: дочекайтеся відповіді модератора.";

const sideOf = (deal: Deal, ownerUserId: string, userId: string): "customer" | "performer" | null => {
  if (ownerUserId === userId) return "customer";
  return deal.performer.id === `me-${userId}` ? "performer" : null;
};

export interface ComplaintFiled {
  complaint: StoredComplaint;
  deal: Deal;
  ownerUserId: string;
}

/**
 * Подати скаргу. null: угоди немає або людина не її сторона (404). Рядок: помилка для людини.
 * Одна відкрита скарга на етап від сторони: друга відхиляється (також унікальним індексом при гонці).
 */
export const fileComplaint = async (input: { userId: string; dealId: string; stageId: unknown; reason: unknown; text: unknown; now?: number }): Promise<ComplaintFiled | string | null> => {
  const { userId, dealId, now = Date.now() } = input;
  const deal = await getDealById(dealId);
  const ownerUserId = deal ? await ownerOfDeal(dealId) : null;
  if (!deal || !ownerUserId) return null;
  const side = sideOf(deal, ownerUserId, userId);
  if (!side) return null;
  const stage = deal.stages.find((item) => item.id === input.stageId);
  const refusal = complaintStageError(deal, stage);
  if (refusal || !stage) return refusal ?? "Етапу не знайдено.";
  const checked = checkComplaint(input.reason, input.text);
  if (!checked.ok) return checked.error;
  const db = getDb();
  const open = await db
    .select({ id: dealComplaints.id })
    .from(dealComplaints)
    .where(and(eq(dealComplaints.dealId, dealId), eq(dealComplaints.stageId, stage.id), eq(dealComplaints.complainantUserId, userId), eq(dealComplaints.status, "open")))
    .limit(1);
  if (open.length > 0) return COMPLAINT_DUPLICATE;
  const row = { id: `cmp_${crypto.randomUUID().slice(0, 10)}`, dealId, stageId: stage.id, complainantUserId: userId, side, reason: checked.value.reason, text: checked.value.text, status: "open" as const, createdAt: now, closedAt: null, closedByEmail: null, closeComment: null };
  try {
    await db.insert(dealComplaints).values(row);
  } catch {
    return COMPLAINT_DUPLICATE;
  }
  return { complaint: row, deal, ownerUserId };
};

export const listComplaints = async (status: "open" | "closed"): Promise<StoredComplaint[]> =>
  getDb().select().from(dealComplaints).where(eq(dealComplaints.status, status)).orderBy(desc(dealComplaints.createdAt)).limit(200);

export const getComplaint = async (id: string): Promise<StoredComplaint | null> => (await getDb().select().from(dealComplaints).where(eq(dealComplaints.id, id)).limit(1))[0] ?? null;

export const complaintsOfDeal = async (dealId: string): Promise<StoredComplaint[]> => getDb().select().from(dealComplaints).where(eq(dealComplaints.dealId, dealId)).orderBy(dealComplaints.createdAt);

/** Закрити скаргу з коментарем модератора. null: скарги немає або вже закрита. */
export const closeComplaint = async (id: string, admin: { email: string; comment: string }, now = Date.now()): Promise<StoredComplaint | null> => {
  const [closed] = await getDb()
    .update(dealComplaints)
    .set({ status: "closed", closedAt: now, closedByEmail: admin.email, closeComment: admin.comment })
    .where(and(eq(dealComplaints.id, id), eq(dealComplaints.status, "open")))
    .returning();
  return closed ?? null;
};
