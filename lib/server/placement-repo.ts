// lib/server/placement-repo.ts
//
// Оплати розміщення на D1. Рівень не зберігаємо, а рахуємо щоразу: він залежить
// від того, скільки платять інші. Справжню оплату зараховує лише рахунок Monobank
// зі статусом success (placement-invoice-repo); addPayment лишився для сидів і тестів.

import { eq, sql } from "drizzle-orm";
import { payments } from "@/db/schema";
import type { PlacementTier } from "@/lib/map/types";
import { quote, tierFor } from "@/lib/placement/pricing";
import type { Payment, Placement } from "@/lib/placement/types";
import { getDb } from "./db";

/** Сумарні оплати кожного платника: userId → сума. */
export const totalsByUser = async (): Promise<Map<string, number>> => {
  const rows = await getDb().select({ userId: payments.userId, total: sql<number>`sum(${payments.amount})` }).from(payments).groupBy(payments.userId);
  return new Map(rows.map((row) => [row.userId, Number(row.total)]));
};

const othersOf = (all: Map<string, number>, userId: string) => [...all].filter(([id]) => id !== userId).map(([, total]) => total);

export const getPlacement = async (userId: string): Promise<Placement> => {
  const [all, rows] = await Promise.all([totalsByUser(), getDb().select().from(payments).where(eq(payments.userId, userId))]);
  const total = all.get(userId) ?? 0;
  const prices = quote(othersOf(all, userId));
  const list: Payment[] = rows
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((row) => ({ id: row.id, amount: row.amount, createdAt: new Date(row.createdAt).toISOString(), tierAfter: row.tierAfter as Payment["tierAfter"] }));
  return { total, tier: tierFor(total, prices), prices, payments: list };
};

/** Рівень людини після того, як до її сум додадуть `amount`. */
export const tierAfterPayment = async (userId: string, amount: number): Promise<PlacementTier> => {
  const all = await totalsByUser();
  return tierFor((all.get(userId) ?? 0) + amount, quote(othersOf(all, userId)));
};

export const addPayment = async (userId: string, amount: number): Promise<Placement> => {
  const tierAfter = await tierAfterPayment(userId, amount);
  await getDb().insert(payments).values({ id: `pay_${crypto.randomUUID().slice(0, 8)}`, userId, amount, tierAfter, createdAt: Date.now() });
  return getPlacement(userId);
};

/** Рівні всіх платників одразу (для карти): userId → рівень з урахуванням решти. */
export const tiersByUser = async (): Promise<Map<string, ReturnType<typeof tierFor>>> => {
  const all = await totalsByUser();
  const result = new Map<string, ReturnType<typeof tierFor>>();
  for (const [userId, total] of all) result.set(userId, tierFor(total, quote(othersOf(all, userId))));
  return result;
};

/**
 * Рівні вибраних людей з одного запиту сум. Збігається з getPlacement(id).tier, зокрема для тих, хто нічого не платив:
 * їхня сума 0, «решта» це всі платники, і рівень рахується тією ж tierFor (нижче мінімальної ціни це завжди рівень 1).
 */
export const tiersFor = async (userIds: string[]): Promise<Map<string, ReturnType<typeof tierFor>>> => {
  const all = await totalsByUser();
  const unpaid = tierFor(0, quote([...all.values()]));
  return new Map([...new Set(userIds)].map((userId) => [userId, all.has(userId) ? tierFor(all.get(userId) as number, quote(othersOf(all, userId))) : unpaid]));
};
