// lib/placement/mock-store.ts
//
// Оплати розміщення в пам'яті сервера, поки немає Monobank і D1 (таблиці
// payments, placements). Справжній шлях: checkout у Monobank → вебхук з
// підписом → запис платежу й нового рівня; тут «платіж» проходить одразу.

import { tierForTotal } from "./tiers";
import type { Payment, Placement } from "./types";

const store = globalThis as typeof globalThis & { __vmPayments?: Map<string, Payment[]> };
const all = (): Map<string, Payment[]> => (store.__vmPayments ??= new Map());

export const getPlacement = (userId: string): Placement => {
  const payments: Payment[] = all().get(userId) ?? [];
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return { total, tier: tierForTotal(total), payments: [...payments].reverse() };
};

export const addPayment = (userId: string, amount: number): Placement => {
  const before: Payment[] = all().get(userId) ?? [];
  const total = before.reduce((sum, payment) => sum + payment.amount, 0) + amount;
  const payment: Payment = {
    id: `pay_${crypto.randomUUID().slice(0, 8)}`,
    amount,
    createdAt: new Date().toISOString(),
    tierAfter: tierForTotal(total),
  };
  all().set(userId, [...before, payment]);
  return getPlacement(userId);
};
