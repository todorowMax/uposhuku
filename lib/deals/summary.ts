// lib/deals/summary.ts
//
// Підписи угоди для людей: рядок угоди в чаті й екран угоди. Стани й правила живуть у machine.ts;
// тут лише тексти етапів для кожної сторони та відбір живих угод.

import { currentStage, dealTotal } from "@/lib/deals/machine";
import { dealCurrency, type Deal, type DealStage } from "@/lib/deals/types";
import { moneyIn } from "@/lib/deals/format";
import type { NextStepTypes } from "@/lib/deals/next-step";

/** Що з етапом, очима замовника. */
export const CUSTOMER_STAGE_TEXT: Record<DealStage["status"], string> = {
  pending: "Очікує оплати",
  claimed: "Перевіряємо оплату",
  funded: "В роботі",
  delivered: "Здано, чекає вашого підтвердження",
  releasing: "Виплата виконується, чекаємо підтвердження банку",
  released: "Виплачено",
  disputed: "Спір",
  refunding: "Повернення виконується, чекаємо підтвердження банку",
  refunded: "Кошти повернено",
};

/** Що з етапом, очима виконавця. */
export const PERFORMER_STAGE_TEXT: Record<string, string> = {
  pending: "Чекаємо оплату від замовника",
  claimed: "Замовник позначив оплату",
  funded: "Оплачено, можна працювати",
  delivered: "Здано, чекаємо підтвердження замовника",
  released: "Виплачено",
  disputed: "Відкрито спір",
  refunded: "Кошти повернено замовнику",
};

/** Пряму угоду платформа не виплачує: коли етап закрито, замовник лише прийняв роботу. */
export const stageText = (deal: Deal, stage: DealStage, role: NextStepTypes.Role): string => {
  if (deal.method === "direct" && stage.status === "released") return "Роботу прийнято";
  return (role === "performer" ? PERFORMER_STAGE_TEXT[stage.status] : undefined) ?? CUSTOMER_STAGE_TEXT[stage.status] ?? stage.status;
};

/** Угода живе й не закрита відмовою чи скасуванням. */
export const isLive = (deal: Deal): boolean => deal.status !== "declined" && deal.status !== "cancelled";

/** Живу угоду за відгуком шукаємо серед угод запиту. */
export const liveDeal = (deals: Deal[], responseId: string): Deal | undefined => deals.find((deal) => deal.responseId === responseId && isLive(deal));

/** Одним рядком: на якому етапі угода. */
export const dealState = (deal: Deal, role: NextStepTypes.Role): string => {
  if (deal.status === "proposed") {
    const mine = (deal.proposedBy ?? "customer") === role;
    return mine ? "Чекаємо відповіді" : "Пропонує умови";
  }
  if (deal.status === "completed") return "Завершено";
  const stage = currentStage(deal);
  return stage ? stageText(deal, stage, role) : "В роботі";
};

/** Назва в рядку: «Лендинг · #A1B2» або «Угода #A1B2». */
export const dealName = (deal: Deal): string => `${deal.title ? `${deal.title} · ` : "Угода "}${deal.number}`;

/** Сума угоди у її валюті. */
export const dealAmount = (deal: Deal): string => moneyIn(dealTotal(deal), dealCurrency(deal));

export const METHOD_NAME = { safe: "Безпечна угода", direct: "Прямий переказ", escrow: "Ескроу (USDT)" } as const;

/** Повернення зі сторінки оплати банку: що показуємо, поки перевіряємо. */
export const PAYMENT_RETURN_TEXT = {
  checking: "Перевіряємо оплату в банку…",
  held: "Банк підтвердив: кошти заморожено.",
  failed: "Оплату не завершено. Гроші не списано, можна спробувати ще раз.",
  pending: "Банк ще обробляє оплату. Статус оновиться сам, коли він підтвердить.",
} as const;
