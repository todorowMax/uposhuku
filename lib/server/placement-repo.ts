// lib/server/placement-repo.ts
//
// Оплати розміщення на D1. Рівень не зберігаємо, а рахуємо щоразу: він залежить
// від того, скільки платять інші. Справжній платіж проходитиме через Monobank і
// вебхук; поки запис створює тестовий POST /api/placement.

import { eq, sql } from "drizzle-orm";
import { payments } from "@/db/schema";
import { demoTotals } from "@/lib/placement/market";
import { quote, tierFor } from "@/lib/placement/pricing";
import type { Payment, Placement } from "@/lib/placement/types";
import { getDb } from "./db";

/** Сумарні оплати кожного платника: userId → сума. */
export const totalsByUser = async (): Promise<Map<string, number>> => {
  const rows = await getDb().select({ userId: payments.userId, total: sql<number>`sum(${payments.amount})` }).from(payments).groupBy(payments.userId);
  return new Map(rows.map((row) => [row.userId, Number(row.total)]));
};

const othersOf = (all: Map<string, number>, userId: string) => [...demoTotals(), ...[...all].filter(([id]) => id !== userId).map(([, total]) => total)];

export const getPlacement = async (userId: string): Promise<Placement> => {
  const [all, rows] = await Promise.all([totalsByUser(), getDb().select().from(payments).where(eq(payments.userId, userId))]);
  const total = all.get(userId) ?? 0;
  const prices = quote(othersOf(all, userId));
  const list: Payment[] = rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({ id: row.id, amount: row.amount, createdAt: new Date(row.createdAt).toISOString(), tierAfter: row.tierAfter as Payment["tierAfter"] }));
  return { total, tier: tierFor(total, prices), prices, payments: list };
};

export const addPayment = async (userId: string, amount: number): Promise<Placement> => {
  const all = await totalsByUser();
  const total = (all.get(userId) ?? 0) + amount;
  await getDb().insert(payments).values({ id: `pay_${crypto.randomUUID().slice(0, 8)}`, userId, amount, tierAfter: tierFor(total, quote(othersOf(all, userId))), createdAt: Date.now() });
  return getPlacement(userId);
};

/** Рівні всіх платників одразу (для карти): userId → рівень з урахуванням решти. */
export const tiersByUser = async (): Promise<Map<string, ReturnType<typeof tierFor>>> => {
  const all = await totalsByUser();
  const result = new Map<string, ReturnType<typeof tierFor>>();
  for (const [userId, total] of all) result.set(userId, tierFor(total, quote(othersOf(all, userId))));
  return result;
};
