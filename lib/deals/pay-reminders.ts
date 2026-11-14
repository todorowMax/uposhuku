// lib/deals/pay-reminders.ts
//
// Нагадування по завислих прямих угодах: прийнята угода стоїть тиждень, а поточний етап так і не має позначки оплати
// («Я оплатив(ла)» чи «Оплату отримано»). Чиста функція: «зараз» приходить параметром, виконує план lib/server/pay-reminders.ts.
// Один етап дає не більше PAY_REMINDER_MAX нагадувань, не частіше разу на PAY_REMINDER_DAYS днів.

import type { Deal, DealStage } from "./types";

const DAY = 86_400_000;
/** Скільки днів етап має чекати оплати, перш ніж нагадати, і мінімальна перерва між нагадуваннями. */
export const PAY_REMINDER_DAYS = 7;
/** Скільки нагадувань на один етап. */
export const PAY_REMINDER_MAX = 2;

/** Від чого рахуємо очікування: прийняття угоди або завершення попереднього етапу (що пізніше). */
const waitingSince = (deal: Deal, index: number): number => {
  const moments = [Date.parse(deal.acceptedAt ?? ""), index > 0 ? Date.parse(deal.stages[index - 1].releasedAt ?? "") : Number.NaN].filter(Number.isFinite);
  return moments.length > 0 ? Math.max(...moments) : Number.NaN;
};

const remindable = (stage: DealStage): boolean => stage.status === "pending" || stage.status === "claimed";

/** Етап, за яким треба нагадати зараз, і номер цього нагадування (1 чи 2); null, якщо нічого. */
export const payReminderDue = (deal: Deal, now: number): { stageId: string; number: number } | null => {
  if (deal.method !== "direct" || deal.status !== "accepted") return null;
  const index = deal.stages.findIndex((stage) => stage.status !== "released");
  const stage = deal.stages[index];
  if (!stage || !remindable(stage)) return null;
  const since = waitingSince(deal, index);
  if (!Number.isFinite(since) || now - since < PAY_REMINDER_DAYS * DAY) return null;
  const sent = stage.payReminders ?? 0;
  if (sent >= PAY_REMINDER_MAX) return null;
  const last = Date.parse(stage.payRemindedAt ?? "");
  if (Number.isFinite(last) && now - last < PAY_REMINDER_DAYS * DAY) return null;
  return { stageId: stage.id, number: sent + 1 };
};
