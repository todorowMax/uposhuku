"use client";

// components/deals/deal-screen/parts/performer-stage-actions.tsx
//
// Що виконавець бачить під активним етапом: оплата від замовника, ескроу, форма здачі. Головна кнопка
// («Прийняти», «Підтвердити оплату», «Здати етап») стоїть унизу екрана.

import { CryptoProofNote } from "@/components/deals/crypto-proof-note";
import { ReceiptLink } from "@/components/deals/receipt-box";
import { METHOD_LABEL } from "@/lib/deals/requisites";
import { performerNeeds } from "@/lib/deals/machine";
import type { Deal, DealStage } from "@/lib/deals/types";
import type { DealScreenState } from "../use-deal-screen";
import { EscrowEntry } from "./escrow-entry";

export const PerformerStageActions = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  const needs = performerNeeds(deal);
  return (
    <>
      {needs === "confirm" && deal.method === "direct" && <CryptoProofNote dealId={deal.id} stageId={stage.id} />}
      {needs === "confirm" && deal.conversationId && <ReceiptLink conversationId={deal.conversationId} stage={stage} />}
      {needs === "confirm" && stage.paidVia && <p className="pe-hint">Спосіб оплати, який вказав замовник: {METHOD_LABEL[stage.paidVia]}.</p>}
      {deal.method === "escrow" && <EscrowEntry stage={stage} onOpen={() => screen.setEscrowOpen(true)} />}
    </>
  );
};
