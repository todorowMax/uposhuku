// lib/server/account-retention.ts
//
// Після видалення акаунта дещо лишається на строк зберігання (RETENTION_YEARS): знімок реквізитів виконавця в угоді зі
// скаргою чи спором. Коли строк від останньої зміни закритої угоди минув, знімок стираємо. Це стосується лише тих,
// хто видалив акаунт: реквізити живих виконавців чіпати не можна. Також тут список видалень для адмінки.

import { and, desc, eq, inArray, isNotNull, lte, notExists, sql } from "drizzle-orm";
import { dealComplaints, dealRequisites, deals, requisiteReads, users } from "@/db/schema";
import { RETENTION_MS } from "@/lib/account/deletion";
import { getDb, inChunks } from "./db";

/** Стирає знімки реквізитів видалених виконавців у закритих угодах, де строк минув. Повертає, скільки стерто. */
export const purgeExpiredRequisites = async (now = Date.now()): Promise<number> => {
  const db = getDb();
  const due = (
    await db
      .select({ dealId: dealRequisites.dealId })
      .from(dealRequisites)
      .innerJoin(deals, eq(deals.id, dealRequisites.dealId))
      .innerJoin(users, sql`${deals.performerId} = 'me-' || ${users.id}`)
      .where(
        and(
          isNotNull(users.deletedAt),
          inArray(deals.status, ["completed", "declined", "cancelled"]),
          lte(deals.updatedAt, now - RETENTION_MS),
          notExists(db.select({ one: sql`1` }).from(dealComplaints).where(and(eq(dealComplaints.dealId, deals.id), eq(dealComplaints.status, "open")))),
        ),
      )
      .limit(500)
  ).map((row) => row.dealId);
  if (due.length === 0) return 0;
  await inChunks(due, async (chunk) => {
    await db.batch([db.delete(requisiteReads).where(inArray(requisiteReads.dealId, chunk)), db.delete(dealRequisites).where(inArray(dealRequisites.dealId, chunk))]);
    return [];
  });
  return due.length;
};

export interface DeletionEntry {
  id: string;
  deletedAt: number;
}

/** Журнал видалень для адмінки: номер і час, без пошти й імені. */
export const listDeletions = async (limit = 200): Promise<{ total: number; items: DeletionEntry[] }> => {
  const db = getDb();
  const [count] = await db.select({ total: sql<number>`count(*)` }).from(users).where(isNotNull(users.deletedAt));
  const rows = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(isNotNull(users.deletedAt)).orderBy(desc(users.deletedAt)).limit(limit);
  return { total: Number(count?.total ?? 0), items: rows.flatMap((row) => (row.deletedAt === null ? [] : [{ id: row.id, deletedAt: row.deletedAt }])) };
};
