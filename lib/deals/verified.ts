// lib/deals/verified.ts
//
// «Перевірена угода»: оплату кожного етапу підтвердив банк (безпечна угода) або блокчейн (ескроу, USDT за хешем
// чи з гаманця). Переказ на IBAN, Binance ID, PayPal і Wise сервер не бачить, тож такі угоди не перевірені:
// інакше мітку накручували б двома власними акаунтами.

import type { Deal, DealStage } from "./types";

/** Способи, яких сервер не може підтвердити сам. */
const UNVERIFIABLE_VIA: readonly (DealStage["paidVia"])[] = ["bank", "binance", "paypal", "wise"];

const isPositive = (value: string | undefined) => {
  try {
    return value !== undefined && BigInt(value) > 0n;
  } catch {
    return false;
  }
};

const isStageVerified = (deal: Pick<Deal, "method">, stage: DealStage, proofs: readonly { stageId: string }[]): boolean => {
  if (stage.status !== "released") return false;
  if (deal.method === "safe") return (stage.paidAmount ?? 0) > 0;
  if (deal.method === "escrow") return isPositive(stage.paidUnits);
  if (UNVERIFIABLE_VIA.includes(stage.paidVia)) return false;
  return proofs.some((proof) => proof.stageId === stage.id);
};

/** Угода завершена, і кожен її етап оплачено підтверджено. `proofs` це записи crypto_proofs цієї угоди. */
export const isVerifiedDeal = (deal: Pick<Deal, "method" | "status" | "stages">, proofs: readonly { stageId: string }[]): boolean =>
  deal.status === "completed" && deal.stages.length > 0 && deal.stages.every((stage) => isStageVerified(deal, stage, proofs));
