// lib/deals/escrow-state.ts
//
// Ескроу в блокчейні: істина про етап лежить у контракті. Єдине місце, де статус етапу ескроу змінюється, це
// applyEscrowState за прочитаним станом клона. Дії release/deliver/dispute/refund через API машини його не міняють
// (lib/deals/machine.ts повертає ESCROW_ONCHAIN). Чисті функції: «зараз» передають ззовні.

import type { EscrowOutcome } from "@/lib/crypto/escrow-chain";
import type { Deal, DealStage } from "./types";

const iso = (ms: number) => new Date(ms).toISOString();
const fromSeconds = (seconds: number) => iso(seconds * 1000);

/** Етап ще може змінитися у блокчейні: не закритий. */
export const isOpenEscrowStage = (stage: DealStage): boolean => stage.status !== "released" && stage.status !== "refunded";

const sameStage = (a: DealStage, b: DealStage) => JSON.stringify(a) === JSON.stringify(b);

/** Етап за станом контракту. Незмінений етап повертається таким самим. */
const stageFrom = (stage: DealStage, outcome: EscrowOutcome, now: number): DealStage => {
  switch (outcome.kind) {
    case "funded":
      if (stage.status === "pending" || stage.status === "claimed") return { ...stage, status: "funded", fundedAt: stage.fundedAt ?? iso(now), deliverBy: fromSeconds(outcome.deliverBy) };
      return stage.status === "funded" && !stage.deliverBy ? { ...stage, deliverBy: fromSeconds(outcome.deliverBy) } : stage;
    case "delivered":
      return stage.status === "delivered" && stage.reviewEnds === fromSeconds(outcome.reviewEnds)
        ? stage
        : { ...stage, status: "delivered", fundedAt: stage.fundedAt ?? iso(now), deliveredAt: stage.deliveredAt ?? iso(now), reviewEnds: fromSeconds(outcome.reviewEnds) };
    case "disputed":
      return stage.status === "disputed" ? stage : { ...stage, status: "disputed", fundedAt: stage.fundedAt ?? iso(now), disputedAt: stage.disputedAt ?? iso(now) };
    case "released":
      return stage.status === "released" ? stage : { ...stage, status: "released", fundedAt: stage.fundedAt ?? iso(now), releasedAt: iso(now), paidUnits: outcome.paid.toString() };
    case "refunded":
      return stage.status === "refunded" ? stage : { ...stage, status: "refunded", refundedAt: iso(now) };
    default:
      return stage;
  }
};

/**
 * Застосовує прочитаний стан контракту до етапу. Повертає нову угоду або undefined, якщо змінювати нічого. Лише для
 * ескроу; закритий етап не змінюється ніколи (блокчейн назад не йде, а повторне читання нічого не зламає).
 */
export const applyEscrowState = (deal: Deal, input: { stageId: string; outcome: EscrowOutcome; now: number }): Deal | undefined => {
  const { stageId, outcome, now } = input;
  if (deal.method !== "escrow") return undefined;
  const stage = deal.stages.find((item) => item.id === stageId);
  if (!stage || !isOpenEscrowStage(stage)) return undefined;
  const updated = stageFrom(stage, outcome, now);
  if (sameStage(stage, updated)) return undefined;
  const stages = deal.stages.map((item) => (item.id === stageId ? updated : item));
  const status = updated.status === "refunded" ? "cancelled" : stages.every((item) => item.status === "released") ? "completed" : deal.status;
  return { ...deal, stages, disputed: stages.some((item) => item.status === "disputed"), status };
};

/** Що sweep має зробити з етапом ескроу. */
export type EscrowSweepAction = { kind: "sync"; stageId: string } | { kind: "remind_performer_review_ended"; stageId: string } | { kind: "remind_customer_delivery_late"; stageId: string };

/**
 * План для угоди: звірити кожен незакритий етап із адресою клона; нагадати виконавцю, коли перевірка завершилась
 * (час «Забрати кошти»), і замовнику, коли здачу прострочено (час «Повернути кошти»). Нагадування по одному разу.
 */
export const planEscrowSweep = (deal: Deal, now: number): EscrowSweepAction[] => {
  if (deal.method !== "escrow" || deal.status !== "accepted") return [];
  const actions: EscrowSweepAction[] = [];
  for (const stage of deal.stages) {
    if (!isOpenEscrowStage(stage) || !stage.escrow) continue;
    actions.push({ kind: "sync", stageId: stage.id });
    if (stage.status === "delivered" && stage.reviewEnds && Date.parse(stage.reviewEnds) < now && !stage.reviewEndedRemindedAt) actions.push({ kind: "remind_performer_review_ended", stageId: stage.id });
    if (stage.status === "funded" && stage.deliverBy && Date.parse(stage.deliverBy) < now && !stage.deliverLateRemindedAt) actions.push({ kind: "remind_customer_delivery_late", stageId: stage.id });
  }
  return actions;
};
