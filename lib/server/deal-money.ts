// lib/server/deal-money.ts
//
// Гроші безпечної угоди: звірка платежу з банком і виплата/повернення холду. Правила, на яких усе тримається:
//  - стан етапу міняє лише відповідь банку, яку ми самі перепитали (getInvoiceStatus), а не тіло вебхука;
//  - намір (releasing, refunding) записано в угоді ДО виклику банку, тож обірваний процес довершить sweep;
//  - перед викликом банку беремо коротку оренду в угоді (attemptAt), щоб двоє не фіналізували одночасно;
//  - етап повертається назад лише коли банк однозначно відмовив І рахунок досі в холді;
//  - усі записи угоди ідуть через mutateDeal (перевірка updated_at, повтор при конфлікті).

import { BASKET_PARTS, planPayout } from "@/lib/deals/basket";
import { revertPayout } from "@/lib/deals/machine";
import { applyPaymentStatus, type BankSnapshot } from "@/lib/deals/payment-status";
import type { Deal, DealStage } from "@/lib/deals/types";
import { cancelInvoice, finalizeInvoice, getInvoiceStatus, MonobankError, type InvoiceStatusResponse } from "@/lib/monobank/client";
import { logServer } from "@/lib/telemetry/log";
import { announceDealChange } from "./deal-announce";
import { mutateDeal, ownerOfDeal } from "./deal-repo";
import { acceptBankSnapshot, activeStagePayment, type DealPayment } from "./payment-repo";

/** Безпечна угода живе на окремому терміналі розщеплення. */
const TERMINAL = "split" as const;

/** Скільки секунд один виклик банку по виплаті вважаємо «в роботі» і не повторюємо. */
export const ATTEMPT_LEASE_MS = 60_000;

const BANK_REJECTED = "Банк не прийняв операцію. Гроші на місці, нічого не втрачено: спробуйте ще раз трохи пізніше.";

const snapshotOf = (status: InvoiceStatusResponse): BankSnapshot => ({
  status: status.status,
  amount: status.amount,
  finalAmount: status.finalAmount,
  at: Date.parse(status.modifiedDate) || undefined,
});

export interface Reconciled {
  /** Угода після застосування (або поточна, якщо змін немає). null, якщо угоди вже немає. */
  deal: Deal | null;
  changed: boolean;
  anomaly?: string;
  bank: InvoiceStatusResponse;
}

/**
 * Застосовує свіжий знімок банку до платежу й етапу. Платіж оновлюється, лише якщо знімок новіший;
 * етап же завжди переглядається за поточним знімком (застосування ідемпотентне), тож обірваний між двома
 * записами процес догоняється наступною звіркою.
 */
export const applyBankStatus = async (payment: DealPayment, bank: InvoiceStatusResponse, now = Date.now()): Promise<Reconciled> => {
  await acceptBankSnapshot(payment.id, { status: bank.status, modifiedDate: bank.modifiedDate, finalAmount: bank.finalAmount }, now);
  const seen: { before: Deal | null; anomaly?: string } = { before: null };
  const result = await mutateDeal(
    payment.dealId,
    (deal) => {
      seen.before = deal;
      seen.anomaly = undefined;
      const applied = applyPaymentStatus(deal, { stageId: payment.stageId, bank: snapshotOf(bank), ours: { amount: payment.amount, card: payment.card } }, now);
      if (applied.kind === "anomaly") {
        seen.anomaly = applied.reason;
        return undefined;
      }
      return applied.changed ? applied.deal : undefined;
    },
    now,
  );
  const { before, anomaly } = seen;
  if (anomaly) {
    logServer({ level: "error", event: "deal_money_anomaly", message: "Банк каже те, чого за записами угоди бути не може", detail: { dealId: payment.dealId, stageId: payment.stageId, invoiceId: payment.invoiceId, reason: anomaly, bankStatus: bank.status } });
  }
  if (typeof result === "string") throw new Error(`Угоду не оновлено: ${result}`);
  if (result === null) return { deal: null, changed: false, anomaly, bank };
  if (result.changed && before) {
    const owner = await ownerOfDeal(payment.dealId);
    if (owner) await announceDealChange({ before, after: result.deal, ownerUserId: owner });
  }
  return { deal: result.deal, changed: result.changed, anomaly, bank };
};

/** Перепитує банк про платіж і застосовує відповідь. Помилка банку піднімається: викликач вирішує, що робити. */
export const reconcilePayment = async (payment: DealPayment, now = Date.now()): Promise<Reconciled> =>
  applyBankStatus(payment, await getInvoiceStatus(payment.invoiceId, TERMINAL), now);

const stageOf = (deal: Deal | null, stageId: string): DealStage | undefined => deal?.stages.find((item) => item.id === stageId);

export type SettleOutcome =
  /** Етапу нема чого довершувати (уже виплачено, повернено чи не в роботі). */
  | { kind: "idle" }
  /** Банк прийняв команду або вже виконує: підсумок прийде вебхуком чи звіркою. */
  | { kind: "pending" }
  /** Хтось інший щойно викликав банк: нічого не робимо. */
  | { kind: "busy" }
  /** Банк однозначно відмовив, етап повернено назад, текст для людини. */
  | { kind: "rejected"; message: string }
  /** Банк не відповів: етап лишається в releasing/refunding, sweep спробує знову. */
  | { kind: "unreachable" }
  /** Банк підтвердив підсумок прямо зараз. */
  | { kind: "done"; deal: Deal };

/** Відмова, після якої повтор нічого не змінить: помилка запиту, а не збій банку чи мережі. */
const definiteRejection = (error: unknown): boolean => error instanceof MonobankError && error.status >= 400 && error.status < 500 && error.status !== 429;

const callBank = async (payment: DealPayment, stage: DealStage): Promise<void> => {
  if (stage.status === "refunding") {
    await cancelInvoice({ invoiceId: payment.invoiceId, terminal: TERMINAL });
    return;
  }
  const percent = stage.payout?.kind === "partial" ? stage.payout.percent : 100;
  const plan = planPayout(payment.basket, Math.round((percent / 100) * BASKET_PARTS));
  if (plan.kind === "partial") await finalizeInvoice({ invoiceId: payment.invoiceId, amount: plan.amount, items: plan.items, terminal: TERMINAL });
  else if (plan.kind === "full") await finalizeInvoice({ invoiceId: payment.invoiceId, amount: plan.amount, terminal: TERMINAL });
  else throw new Error("План виплати порожній");
};

/** Береться оренда на виклик банку; false, якщо ще діє попередня. */
const takeLease = async (dealId: string, stageId: string, now: number): Promise<boolean> => {
  let leased = true;
  const result = await mutateDeal(
    dealId,
    (deal) => {
      const stage = stageOf(deal, stageId);
      if (stage?.status !== "releasing" && stage?.status !== "refunding") {
        leased = false;
        return undefined;
      }
      if (stage.attemptAt !== undefined && now - stage.attemptAt < ATTEMPT_LEASE_MS) {
        leased = false;
        return undefined;
      }
      leased = true;
      return { ...deal, stages: deal.stages.map((item) => (item.id === stageId ? { ...item, attemptAt: now } : item)) };
    },
    now,
  );
  return leased && result !== null && typeof result !== "string";
};

/** Відмова банку: етап назад, але лише якщо рахунок досі в холді (інакше хтось уже виконує операцію). */
const rejectIfStillHeld = async (payment: DealPayment, stageId: string, now: number): Promise<SettleOutcome> => {
  const bank = await getInvoiceStatus(payment.invoiceId, TERMINAL).catch(() => null);
  if (!bank || bank.status !== "hold") return { kind: "pending" };
  const result = await mutateDeal(payment.dealId, (deal) => {
    const reverted = revertPayout(deal, stageId, BANK_REJECTED);
    return typeof reverted === "string" ? undefined : reverted;
  }, now);
  return result !== null && typeof result !== "string" && result.changed ? { kind: "rejected", message: BANK_REJECTED } : { kind: "pending" };
};

/** Одразу після виклику питаємо банк ще раз: інколи підсумок уже відомий. Інакше він дійде вебхуком чи звіркою. */
const confirmAfterCall = async (payment: DealPayment, stageId: string, now: number): Promise<SettleOutcome> => {
  try {
    const after = await reconcilePayment(payment, now);
    const next = stageOf(after.deal, stageId);
    if (after.deal && next && !isMoney(next)) return { kind: "done", deal: after.deal };
  } catch {
    // Підсумок дійде вебхуком чи звіркою.
  }
  return { kind: "pending" };
};

const isMoney = (stage: DealStage | undefined): stage is DealStage => stage?.status === "releasing" || stage?.status === "refunding";

/**
 * Довершує виплату чи повернення етапу, який у releasing/refunding. Викликається при приймання, рішенні
 * модератора і з sweep: безпечно кликати скільки завгодно, бо спершу питає банк, а викликає банк лише
 * коли той усе ще тримає холд.
 */
export const settleStage = async (dealId: string, stageId: string, now = Date.now()): Promise<SettleOutcome> => {
  const payment = await activeStagePayment(dealId, stageId);
  if (!payment || payment.invoiceId.startsWith("pending:")) return { kind: "idle" };
  let state: Reconciled;
  try {
    state = await reconcilePayment(payment, now);
  } catch {
    return { kind: "unreachable" };
  }
  const stage = stageOf(state.deal, stageId);
  if (!isMoney(stage)) return state.deal && state.changed && stage ? { kind: "done", deal: state.deal } : { kind: "idle" };
  // Банк уже виконує операцію (processing) або рахунок не в холді: чекаємо підсумку.
  if (state.bank.status !== "hold") return { kind: "pending" };
  if (!(await takeLease(dealId, stageId, now))) return { kind: "busy" };
  try {
    await callBank(payment, stage);
  } catch (error) {
    logServer({ level: "error", event: "deal_money_call_failed", message: error instanceof Error ? error.message : String(error), detail: { dealId, stageId, kind: stage.status } });
    return definiteRejection(error) ? rejectIfStillHeld(payment, stageId, now) : { kind: "unreachable" };
  }
  return confirmAfterCall(payment, stageId, now);
};

/** Пояснення людині за підсумком settle. null, якщо казати нічого. */
export const settleMessage = (outcome: SettleOutcome): { status: number; detail: string } | null => {
  switch (outcome.kind) {
    case "rejected":
      return { status: 409, detail: outcome.message };
    case "unreachable":
      return { status: 202, detail: "Банк зараз не відповів. Виплату не втрачено: ми перевіримо й довершимо її самі." };
    default:
      return null;
  }
};
