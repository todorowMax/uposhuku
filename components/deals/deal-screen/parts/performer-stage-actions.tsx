"use client";

// components/deals/deal-screen/parts/performer-stage-actions.tsx
//
// Що виконавець бачить під активним етапом: оплата від замовника, ескроу, форма здачі. Головна кнопка
// («Прийняти», «Підтвердити оплату») стоїть унизу екрана.

import { CryptoProofNote } from "@/components/deals/crypto-proof-note";
import { DeliveryForm } from "@/components/deals/delivery-form";
import { ReceiptLink } from "@/components/deals/receipt-box";
import { EscrowSection } from "@/components/wallet/escrow-section";
import { METHOD_LABEL } from "@/lib/deals/requisites";
import { performerNeeds } from "@/lib/deals/machine";
import type { Deal, DealStage } from "@/lib/deals/types";
import type { DealScreenState } from "../use-deal-screen";

export const PerformerStageActions = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  const needs = performerNeeds(deal);
  return (
    <>
      {needs === "confirm" && deal.method === "direct" && <CryptoProofNote dealId={deal.id} stageId={stage.id} />}
      {needs === "confirm" && deal.conversationId && <ReceiptLink conversationId={deal.conversationId} stage={stage} />}
      {needs === "confirm" && stage.paidVia && <p className="pe-hint">Спосіб оплати, який вказав замовник: {METHOD_LABEL[stage.paidVia]}.</p>}
      {deal.method === "escrow" && <EscrowSection deal={deal} stage={stage} side="performer" onChanged={() => undefined} />}
      {needs === "deliver" && deal.method !== "escrow" && (
        <DeliveryForm dealId={deal.id} busy={screen.busy !== null} onSubmit={async (fields) => void (await screen.act("deliver", fields))} />
      )}
    </>
  );
};
