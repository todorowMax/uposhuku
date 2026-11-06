// lib/server/deal-sweep.ts
//
// Фоновий прохід по грошах безпечної угоди (викликає /api/internal/tick, раз на 5 хвилин). Він робить те, що
// не зробили вебхуки й люди: довершує виплати й повернення, що зависли, приймає роботу за мовчання замовника,
// скасовує холд етапу, який не здали, попереджає про кінець холду й звіряє незавершені платежі (на `expired`
// вебхука немає). Що робити з угодою, вирішує чиста planDealSweep; тут лише виконання. Помилка одного
// запису не зупиняє решту, за прохід не більше SWEEP_LIMIT угод.

import { and, asc, eq, like } from "drizzle-orm";
import { deals } from "@/db/schema";
import { parseAdminEmails } from "@/lib/admin/access";
import { applyAutoAccept, applyHoldExpiryRefund } from "@/lib/deals/machine";
import { planEscrowSweep, type EscrowSweepAction } from "@/lib/deals/escrow-state";
import { planDealSweep, type SweepAction } from "@/lib/deals/sweep-plan";
import type { Deal } from "@/lib/deals/types";
import { logServer } from "@/lib/telemetry/log";
import { notifyParties } from "./deal-announce";
import { cryptoConfig } from "./crypto-config";
import { reconcilePayment, settleStage } from "./deal-money";
import { syncEscrowStage } from "./escrow-sync";
import { mutateDeal } from "./deal-repo";
import { getDb } from "./db";
import { readVar } from "./env";
import { sendAdminNotice } from "./mail";
import { abandonReservation, listOpenPayments, touchPayment, type DealPayment } from "./payment-repo";

/** Скільки угод обробляємо за один прохід. */
export const SWEEP_LIMIT = 50;
/** Скільки платежів звіряємо за прохід. */
export const RECONCILE_LIMIT = 50;
/** Скільки угод дивимось, щоб знайти тих, кому щось потрібно. */
const SCAN_LIMIT = 300;
/** Резерв платежу без рахунку старший за це вважаємо мертвим. */
const STALE_RESERVATION_MS = 15 * 60_000;

export interface SweepReport {
  /** Етапів ескроу, звірених із контрактом за прохід. */
  escrow: number;
  deals: number;
  actions: number;
  payments: number;
  errors: number;
}

const owner = async (dealId: string): Promise<string | null> => (await getDb().select({ id: deals.ownerUserId }).from(deals).where(eq(deals.id, dealId)).limit(1))[0]?.id ?? null;

/** Один раз ставить мітку в етапі; повертає true лише тому, хто її поставив. */
const markOnce = async (target: { dealId: string; stageId: string }, field: "holdWarnedAt" | "holdAlertAt", now: number): Promise<boolean> => {
  const { dealId, stageId } = target;
  const result = await mutateDeal(
    dealId,
    (deal) => {
      const stage = deal.stages.find((item) => item.id === stageId);
      if (!stage || stage[field]) return undefined;
      return { ...deal, stages: deal.stages.map((item) => (item.id === stageId ? { ...item, [field]: new Date(now).toISOString() } : item)) };
    },
    now,
  );
  return result !== null && typeof result !== "string" && result.changed;
};

const adminAlert = async (deal: Deal, stageId: string): Promise<void> => {
  const stage = deal.stages.find((item) => item.id === stageId);
  const emails = parseAdminEmails(readVar("ADMIN_EMAILS"));
  if (!stage || emails.length === 0) return;
  await sendAdminNotice(
    emails,
    `Холд добігає кінця: угода ${deal.number}`,
    `За угодою ${deal.number} етап «${stage.title}» ${stage.status === "disputed" ? "у спорі" : "здано, але не прийнято"}, а холд банку закінчується менш ніж за 2 доби. Після цього банк поверне кошти замовнику. Потрібне рішення модератора.`,
  );
};

const startAndSettle = async (target: { dealId: string; stageId: string }, change: (deal: Deal) => Deal | string, now: number): Promise<boolean> => {
  const { dealId, stageId } = target;
  const result = await mutateDeal(dealId, change, now);
  if (result === null || typeof result === "string") return false;
  await settleStage(dealId, stageId, now);
  return true;
};

const perform = async (deal: Deal, action: SweepAction, now: number): Promise<void> => {
  const { stageId } = action;
  switch (action.kind) {
    case "settle":
      await settleStage(deal.id, stageId, now);
      return;
    case "auto_accept": {
      const started = await startAndSettle({ dealId: deal.id, stageId }, (current) => applyAutoAccept(current, stageId, now), now);
      const ownerId = await owner(deal.id);
      if (started && ownerId) notifyParties({ deal, ownerUserId: ownerId, action: "auto_accepted", stageId });
      return;
    }
    case "cancel_hold": {
      const started = await startAndSettle({ dealId: deal.id, stageId }, (current) => applyHoldExpiryRefund(current, stageId, now), now);
      const ownerId = await owner(deal.id);
      if (started && ownerId) notifyParties({ deal, ownerUserId: ownerId, action: "hold_expiry_refund", stageId });
      return;
    }
    case "warn_hold_ending": {
      const ownerId = await owner(deal.id);
      if (ownerId && (await markOnce({ dealId: deal.id, stageId }, "holdWarnedAt", now))) notifyParties({ deal, ownerUserId: ownerId, action: "hold_ending", stageId });
      return;
    }
    case "alert_admins":
      if (await markOnce({ dealId: deal.id, stageId }, "holdAlertAt", now)) await adminAlert(deal, stageId);
      return;
  }
};

/** Прийняті безпечні угоди, найдавніше змінені першими: ті, що давно мовчать, підходять під терміни першими. */
const candidates = async (): Promise<Deal[]> =>
  (
    await getDb()
      .select()
      .from(deals)
      .where(and(eq(deals.status, "accepted"), like(deals.data, '%"method":"safe"%')))
      .orderBy(asc(deals.updatedAt))
      .limit(SCAN_LIMIT)
  ).map((row) => JSON.parse(row.data) as Deal);

const reconcileOne = async (payment: DealPayment, now: number): Promise<void> => {
  if (payment.status !== "creating") {
    await reconcilePayment(payment, now);
    await touchPayment(payment.id, now);
    return;
  }
  // Рахунок так і не записали: відповідь банку загубилась або процес обірвався. Вебхук ще знайде його за reference.
  if (now - payment.createdAt >= STALE_RESERVATION_MS) await abandonReservation(payment.id, now);
};

const reconcileOpenPayments = async (now: number, report: SweepReport): Promise<void> => {
  for (const payment of await listOpenPayments(RECONCILE_LIMIT)) {
    report.payments += 1;
    try {
      await reconcileOne(payment, now);
    } catch (error) {
      report.errors += 1;
      logServer({ level: "error", event: "deal_sweep_reconcile_failed", message: error instanceof Error ? error.message : String(error), detail: { paymentId: payment.id } });
      await touchPayment(payment.id, now);
    }
  }
};

/** Прийняті угоди ескроу, найдавніше змінені першими. */
const escrowCandidates = async (): Promise<Deal[]> =>
  (
    await getDb()
      .select()
      .from(deals)
      .where(and(eq(deals.status, "accepted"), like(deals.data, '%"method":"escrow"%')))
      .orderBy(asc(deals.updatedAt))
      .limit(SCAN_LIMIT)
  ).map((row) => JSON.parse(row.data) as Deal);

const performEscrow = async (deal: Deal, action: EscrowSweepAction, now: number): Promise<void> => {
  const { stageId } = action;
  if (action.kind === "sync") {
    const result = await syncEscrowStage({ dealId: deal.id, stageId, now });
    // Мережа недоступна чи контракт не підходить: стан не міняли, це не зупиняє решту.
    if (!result.ok && result.status === 503) throw new Error("escrow rpc unavailable");
    return;
  }
  const field = action.kind === "remind_performer_review_ended" ? "reviewEndedRemindedAt" : "deliverLateRemindedAt";
  const notice = action.kind === "remind_performer_review_ended" ? "escrow_review_ended" : "escrow_delivery_late";
  const marked = await mutateDeal(
    deal.id,
    (current) => {
      const stage = current.stages.find((item) => item.id === stageId);
      if (!stage || stage[field]) return undefined;
      return { ...current, stages: current.stages.map((item) => (item.id === stageId ? { ...item, [field]: new Date(now).toISOString() } : item)) };
    },
    now,
  );
  if (marked === null || typeof marked === "string" || !marked.changed) return;
  const ownerId = await owner(deal.id);
  if (!ownerId) return;
  // Простроченій здачі нагадуємо замовнику, закінченій перевірці виконавцю: сповіщення йде обом, текст пояснює дію.
  notifyParties({ deal, ownerUserId: ownerId, action: notice, stageId });
};

/** Звірка етапів ескроу з контрактом і нагадування. Без фабрики в оточенні функція вимкнена. */
const runEscrowSweep = async (now: number, report: SweepReport): Promise<void> => {
  if (!cryptoConfig()?.factory) return;
  let handled = 0;
  for (const deal of await escrowCandidates()) {
    if (handled >= SWEEP_LIMIT) break;
    const plan = planEscrowSweep(deal, now);
    if (plan.length === 0) continue;
    handled += 1;
    for (const action of plan) {
      report.escrow += 1;
      try {
        await performEscrow(deal, action, now);
      } catch (error) {
        report.errors += 1;
        logServer({ level: "error", event: "escrow_sweep_failed", message: error instanceof Error ? error.message : String(error), detail: { dealId: deal.id, action: action.kind, stageId: action.stageId } });
      }
    }
  }
};

export const runDealSweep = async (now = Date.now()): Promise<SweepReport> => {
  const report: SweepReport = { escrow: 0, deals: 0, actions: 0, payments: 0, errors: 0 };
  await reconcileOpenPayments(now, report);
  await runEscrowSweep(now, report);
  for (const deal of await candidates()) {
    if (report.deals >= SWEEP_LIMIT) break;
    const plan = planDealSweep(deal, now);
    if (plan.length === 0) continue;
    report.deals += 1;
    for (const action of plan) {
      report.actions += 1;
      try {
        await perform(deal, action, now);
      } catch (error) {
        report.errors += 1;
        logServer({ level: "error", event: "deal_sweep_failed", message: error instanceof Error ? error.message : String(error), detail: { dealId: deal.id, action: action.kind, stageId: action.stageId } });
      }
    }
  }
  return report;
};
