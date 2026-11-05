// lib/deals/payment-status.ts
//
// Єдине місце, де стан банку перетворюється на стан етапу. Чиста функція: «зараз» приходить
// параметром, нічого не читає й не пише. Правило: «заморожено» і «виплачено» ставимо лише за
// статусом, який банк підтвердив (його перепитано у банку, а не взято з тіла вебхука), а сума
// банку має збігатися з нашою. Застосування ідемпотентне: повтор того самого статусу нічого не міняє.

import { quoteStage } from "./price";
import { HOLD_DAYS, type CardKind, type Deal, type DealStage } from "./types";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Статус рахунку в банку, як його повертає getInvoiceStatus. */
export type BankInvoiceStatus = "created" | "processing" | "hold" | "success" | "failure" | "reversed" | "expired";

export interface BankSnapshot {
  status: BankInvoiceStatus;
  /** Сума рахунку в копійках. */
  amount: number;
  finalAmount?: number;
  /** Коли банк останнє змінив рахунок (мс). Для холду це початок відліку: звірка через дні не подовжує його. */
  at?: number;
}

/** Що ми самі записали про платіж етапу під час створення рахунку. */
export interface OurPayment {
  amount: number;
  card: CardKind;
}

export type PaymentApplied =
  | { kind: "ok"; deal: Deal; changed: boolean }
  /** Банк каже те, чого за нашими записами бути не може: стан не міняємо, людина дивиться вручну. */
  | { kind: "anomaly"; reason: string };

const AFTER_HOLD: DealStage["status"][] = ["funded", "delivered", "disputed", "releasing", "refunding"];

/** Угода, етап і час разом: щоб функції нижче не росли в параметрах. */
interface Step {
  deal: Deal;
  stage: DealStage;
  now: number;
}

const unchanged = ({ deal }: Step): PaymentApplied => ({ kind: "ok", deal, changed: false });
const changed = (deal: Deal): PaymentApplied => ({ kind: "ok", deal, changed: true });

const replaceStage = (deal: Deal, stage: DealStage): Deal => {
  const stages = deal.stages.map((item) => (item.id === stage.id ? stage : item));
  return { ...deal, stages, disputed: stages.some((item) => item.status === "disputed") };
};

const unfund = (stage: DealStage): DealStage => {
  const { fundedAt: _f, holdUntil: _h, payment: _p, deliveredAt: _d, ...rest } = stage;
  return { ...rest, status: "pending" };
};

const refunded = ({ deal, stage, now }: Step): Deal => {
  const { payout: _payout, payoutError: _error, ...rest } = stage;
  return { ...replaceStage(deal, { ...rest, status: "refunded", refundedAt: iso(now) }), status: deal.status === "completed" ? "completed" : "cancelled" };
};

const released = ({ deal, stage, now }: Step, bank: BankSnapshot): Deal => {
  const { payoutError: _error, ...rest } = stage;
  const next = replaceStage(deal, { ...rest, status: "released", releasedAt: iso(now), paidAmount: bank.finalAmount ?? bank.amount });
  return { ...next, status: next.stages.every((item) => item.status === "released") ? "completed" : deal.status };
};

const hold = (step: Step, input: { ours: OurPayment; at: number }): PaymentApplied => {
  const { deal, stage } = step;
  if (stage.status !== "pending") return unchanged(step);
  const payment = quoteStage(stage.amount, input.ours.card);
  // Сума платежу мусить збігатися з тим, що рахує етап: інакше холд за цей етап не вважаємо.
  if (payment.total !== input.ours.amount) return { kind: "anomaly", reason: "hold_amount_differs_from_stage" };
  return changed(replaceStage(deal, { ...stage, status: "funded", fundedAt: iso(step.now), holdUntil: iso(input.at + HOLD_DAYS * DAY), payment }));
};

const success = (step: Step, bank: BankSnapshot): PaymentApplied => {
  const { stage } = step;
  if (stage.status === "released" || stage.status === "refunded") return unchanged(step);
  if (stage.status === "pending") return { kind: "anomaly", reason: "success_without_hold" };
  // Виплату ми завжди записуємо наперед (releasing). Інший стан значить, що банк виплатив без нашого наміру:
  // правда за банком, але це варто побачити.
  return changed(released(step, bank));
};

/** expired: холд закінчився й гроші вже в замовника. До здачі етап знову чекає оплати, після здачі це повернення. */
const expired = (step: Step): PaymentApplied => {
  if (step.stage.status === "funded") return changed(replaceStage(step.deal, unfund(step.stage)));
  return AFTER_HOLD.includes(step.stage.status) ? changed(refunded(step)) : unchanged(step);
};

const reversed = (step: Step): PaymentApplied => (AFTER_HOLD.includes(step.stage.status) ? changed(refunded(step)) : unchanged(step));

/** Що банк сказав і що ми самі записали про цей платіж. */
export interface PaymentInput {
  stageId: string;
  bank: BankSnapshot;
  ours: OurPayment;
}

/**
 * Переводить етап за знімком банку. `created` і `processing` нічого не міняють (виплата ще в дорозі).
 * `failure` після холду етап не чіпає: невідомо, чи банк відхилив виплату, чи це тимчасово, тож рішення
 * лишається за повторною звіркою. До холду `failure` просто звільняє етап для нової оплати.
 */
export const applyPaymentStatus = (deal: Deal, input: PaymentInput, now: number): PaymentApplied => {
  const stage = deal.stages.find((item) => item.id === input.stageId);
  if (!stage) return { kind: "anomaly", reason: "stage_missing" };
  const { bank, ours } = input;
  const step: Step = { deal, stage, now };
  if ((bank.status === "hold" || bank.status === "success") && bank.amount !== ours.amount) return { kind: "anomaly", reason: "amount_mismatch" };
  switch (bank.status) {
    case "hold":
      return hold(step, { ours, at: Math.min(now, bank.at ?? now) });
    case "success":
      return success(step, bank);
    case "expired":
      return expired(step);
    case "reversed":
      return reversed(step);
    case "failure":
      return stage.status === "funded" ? { kind: "anomaly", reason: "failure_after_hold" } : unchanged(step);
    default:
      return unchanged(step);
  }
};
