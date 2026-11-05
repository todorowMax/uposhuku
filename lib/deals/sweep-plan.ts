// lib/deals/sweep-plan.ts
//
// Що фоновий прохід (cron, раз на 5 хвилин) має зробити з безпечною угодою. Чиста функція: «зараз» приходить
// параметром, нічого не читає й не пише; виконує план lib/server/deal-sweep.ts. Правила з оферти:
// мовчання замовника після REVIEW_DAYS робочих днів це приймання; етап, не зданий до кінця холду, повертається.

import { REVIEW_DAYS, type Deal, type DealStage } from "./types";

const DAY = 86_400_000;
const MINUTE = 60_000;

/** Скільки чекаємо, перш ніж довершувати виплату чи повернення, яке не закінчилося вебхуком. */
export const SETTLE_AFTER_MS = 5 * MINUTE;
/** За скільки до кінця холду попереджаємо сторони й адміністраторів. */
export const HOLD_WARN_MS = 2 * DAY;
/** За скільки до кінця холду скасовуємо холд етапу, який так і не здали. */
export const HOLD_CANCEL_MS = 1 * DAY;

export type SweepAction =
  | { kind: "settle"; stageId: string }
  | { kind: "auto_accept"; stageId: string }
  | { kind: "cancel_hold"; stageId: string }
  | { kind: "warn_hold_ending"; stageId: string }
  | { kind: "alert_admins"; stageId: string };

/** Через n робочих днів (пн-пт за UTC) після моменту `from`; свята не враховуємо. */
export const addBusinessDays = (from: number, days: number): number => {
  let moment = from;
  let left = days;
  while (left > 0) {
    moment += DAY;
    const weekday = new Date(moment).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return moment;
};

const holdLeft = (stage: DealStage, now: number): number | null => (stage.holdUntil ? Date.parse(stage.holdUntil) - now : null);

const settleDue = (stage: DealStage, now: number): boolean => {
  const since = Date.parse((stage.status === "releasing" ? stage.releasingAt : stage.refundingAt) ?? "");
  // Без мітки часу (старі записи) довершуємо одразу.
  return !Number.isFinite(since) || now - since >= SETTLE_AFTER_MS;
};

const autoAcceptDue = (stage: DealStage, now: number): boolean => {
  const delivered = Date.parse(stage.deliveredAt ?? "");
  // payoutError: банк щойно відмовив у виплаті. Не б'ємо його кожні 5 хвилин, чекаємо рішення людини.
  return Number.isFinite(delivered) && !stage.payoutError && now >= addBusinessDays(delivered, REVIEW_DAYS);
};

const planStage = (stage: DealStage, now: number): SweepAction[] => {
  const id = stage.id;
  if (stage.status === "releasing" || stage.status === "refunding") return settleDue(stage, now) ? [{ kind: "settle", stageId: id }] : [];
  const left = holdLeft(stage, now);
  if (stage.status === "delivered" && autoAcceptDue(stage, now)) return [{ kind: "auto_accept", stageId: id }];
  if (left === null || left <= 0) return [];
  // Холд за етап, який так і не здали, скасовуємо за добу до кінця: інакше банк поверне кошти сам і без нашого рішення.
  if (stage.status === "funded" && left < HOLD_CANCEL_MS) return [{ kind: "cancel_hold", stageId: id }];
  const actions: SweepAction[] = [];
  if (["funded", "delivered", "disputed"].includes(stage.status) && left <= HOLD_WARN_MS && !stage.holdWarnedAt) actions.push({ kind: "warn_hold_ending", stageId: id });
  // Спір чи здана, але не прийнята робота біля кінця холду: потрібна людина, інакше банк поверне гроші замовнику.
  if ((stage.status === "disputed" || stage.status === "delivered") && left < HOLD_WARN_MS && !stage.holdAlertAt) actions.push({ kind: "alert_admins", stageId: id });
  return actions;
};

/** Дії для угоди; порожньо, якщо нічого робити. Тільки прийняті безпечні угоди. */
export const planDealSweep = (deal: Deal, now: number): SweepAction[] =>
  deal.method === "safe" && deal.status === "accepted" ? deal.stages.flatMap((stage) => planStage(stage, now)) : [];
