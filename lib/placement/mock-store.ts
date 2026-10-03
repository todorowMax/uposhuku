// lib/placement/mock-store.ts
//
// Оплати розміщення в пам'яті сервера, поки немає Monobank і D1 (таблиці
// payments, placements). Справжній шлях: checkout у Monobank → вебхук з
// підписом → запис платежу й нового рівня; тут «платіж» проходить одразу.
//
// Рівень не зберігаємо, а рахуємо щоразу: він залежить від того, скільки
// платять інші, тож вас можуть перебити, і маркер зменшиться.

import { demoTotals } from "./market";
import { quote, tierFor } from "./pricing";
import type { Payment, Placement } from "./types";

const store = globalThis as typeof globalThis & { __vmPayments?: Map<string, Payment[]> };
const all = (): Map<string, Payment[]> => (store.__vmPayments ??= new Map());

const sum = (payments: Payment[]) => payments.reduce((total, payment) => total + payment.amount, 0);

/** Сумарні оплати всіх, окрім цієї людини. */
const othersTotals = (userId: string): number[] => [
  ...demoTotals(),
  ...[...all()].filter(([id]) => id !== userId).map(([, payments]) => sum(payments)),
];

export const getPlacement = (userId: string): Placement => {
  const payments: Payment[] = all().get(userId) ?? [];
  const total = sum(payments);
  const prices = quote(othersTotals(userId));
  return { total, tier: tierFor(total, prices), prices, payments: [...payments].reverse() };
};

export const addPayment = (userId: string, amount: number): Placement => {
  const before: Payment[] = all().get(userId) ?? [];
  const total = sum(before) + amount;
  const payment: Payment = {
    id: `pay_${crypto.randomUUID().slice(0, 8)}`,
    amount,
    createdAt: new Date().toISOString(),
    tierAfter: tierFor(total, quote(othersTotals(userId))),
  };
  all().set(userId, [...before, payment]);
  return getPlacement(userId);
};
