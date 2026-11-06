"use client";

// components/deals/deal-screen/parts/payment-screen.tsx
//
// Оплата прямим переказом на екрані: вкладки способів, реквізити, QR, посилання, чек. Унизу закріплена «Я оплатив(ла)».
// Екран тримає вибрану вкладку, поки людина ходить у застосунок банку й повертається.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { ReceiptBox } from "@/components/deals/receipt-box";
import { TransferCard } from "@/components/deals/transfer-card";
import { useTransferCard } from "@/components/deals/use-transfer-card";
import type { PaymentMethod } from "@/lib/deals/requisites";
import type { Deal, DealStage } from "@/lib/deals/types";

export namespace PaymentScreenTypes {
  export type Props = {
    deal: Deal;
    stage: DealStage;
    busy: boolean;
    onOpenChange: (open: boolean) => void;
    onClaim: (via?: PaymentMethod) => Promise<boolean>;
  };
}

export const PaymentScreen = ({ deal, stage, busy, onOpenChange, onClaim }: PaymentScreenTypes.Props) => {
  const card = useTransferCard(deal.id, deal.number, stage.amount);
  return (
    <Screen
      open
      onOpenChange={onOpenChange}
      title="Оплата переказом"
      desktop="panel"
      footer={
        <Button variant="offer" disabled={busy || card.state.kind === "loading"} onClick={() => void onClaim(card.via ?? undefined)} className="w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Я оплатив(ла)
        </Button>
      }
    >
      <div className="deal">
        <TransferCard card={card} dealId={deal.id} requestId={deal.requestId} stageId={stage.id} amount={stage.amount} />
        <ReceiptBox deal={deal} stage={stage} />
      </div>
    </Screen>
  );
};
