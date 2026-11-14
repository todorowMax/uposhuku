"use client";

// components/deals/deal-screen/deal-screen.tsx
//
// Екран угоди (шар «екран», DESIGN.md): сводка й етапи, умови, скарга, відгук. Унизу закріплена одна головна
// кнопка кроку, який за мною (lib/deals/next-step.ts). На десктопі це панель ліворуч від чату.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { ComplaintBox } from "@/components/deals/complaint-box";
import { loadDeals } from "@/lib/deals/client";
import { complaintStageError } from "@/lib/deals/complaints";
import { paymentReturnStore } from "@/lib/deals/use-payment-return";
import { formatKop, quoteStage } from "@/lib/deals/price";
import { PAYMENT_RETURN_TEXT, dealName } from "@/lib/deals/summary";
import { needsMe, type NextStepTypes } from "@/lib/deals/next-step";
import type { Deal } from "@/lib/deals/types";
import { useStore } from "@/lib/store";
import { CustomerStageActions } from "./parts/customer-stage-actions";
import { DealSummary } from "./parts/deal-summary";
import { PerformerStageActions } from "./parts/performer-stage-actions";
import { DeliveryScreen } from "./parts/delivery-screen";
import { EscrowScreen } from "./parts/escrow-screen";
import { PaymentScreen } from "./parts/payment-screen";
import { ProposalNotice } from "./parts/proposal-notice";
import { ReceivedSheet } from "./parts/received-sheet";
import { ReleaseSheet } from "./parts/release-sheet";
import { ReviewForm } from "./parts/review-form";
import { StageTimeline } from "./parts/stage-timeline";
import { useDealScreen } from "./use-deal-screen";

export namespace DealScreenTypes {
  export type Props = {
    deal: Deal;
    role: NextStepTypes.Role;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Угода змінилась після дії: батько кладе її у свій список. */
    onChanged: (deal: Deal) => void;
  };
}

export const DealScreen = ({ deal, role, open, onOpenChange, onChanged }: DealScreenTypes.Props) => {
  const screen = useDealScreen({ deal, role, onChanged });
  const paymentReturn = useStore(paymentReturnStore);
  const { stage, footerStep, busy } = screen;
  // Сума до оплати на кнопці: людина бачить, скільки заморозить.
  const payLabel = footerStep?.action === "pay" && stage ? `${footerStep.label} ${formatKop(quoteStage(stage.amount).total)}` : footerStep?.label;

  return (
    <Screen
      open={open}
      onOpenChange={onOpenChange}
      title={dealName(deal)}
      desktop="panel"
      footer={
        footerStep ? (
          <Button variant="offer" disabled={busy !== null} onClick={screen.doStep} className="w-full">
            {busy !== null && <Loader2 className="size-4 animate-spin" />}
            {payLabel}
          </Button>
        ) : undefined
      }
    >
      <div className="deal">
        <DealSummary deal={deal} todo={needsMe(deal, role)} />
        {deal.status === "proposed" && <ProposalNotice deal={deal} role={role} screen={screen} />}
        {deal.status !== "proposed" && (
          <StageTimeline
            deal={deal}
            role={role}
            actions={(item) =>
              role === "performer" ? <PerformerStageActions deal={deal} stage={item} screen={screen} /> : <CustomerStageActions deal={deal} stage={item} screen={screen} />
            }
          />
        )}
        {paymentReturn?.dealId === deal.id && (
          <p role="status" className="deal-note">
            {PAYMENT_RETURN_TEXT[paymentReturn.state]}
          </p>
        )}
        {screen.error && (
          <p role="alert" className="auth-error">
            {screen.error}
          </p>
        )}
        {deal.status === "accepted" && stage && !complaintStageError(deal, stage) && <ComplaintBox dealId={deal.id} stageId={stage.id} />}
        {deal.status === "completed" && role === "customer" && <ReviewForm dealId={deal.id} performerName={deal.performer.name} />}
      </div>
      {stage && <ReleaseSheet deal={deal} stage={stage} screen={screen} />}
      {role === "performer" && <ReceivedSheet screen={screen} />}
      {screen.delivering && stage && (
        <DeliveryScreen
          dealId={deal.id}
          busy={screen.busy === "deliver"}
          onOpenChange={screen.setDelivering}
          onSubmit={async (fields) => {
            if (await screen.act("deliver", fields)) screen.setDelivering(false);
          }}
        />
      )}
      {screen.escrowOpen && stage && deal.method === "escrow" && (
        <EscrowScreen deal={deal} stage={stage} side={role} onOpenChange={screen.setEscrowOpen} onChanged={() => void loadDeals(deal.requestId)} />
      )}
      {screen.paying && stage?.status === "pending" && (
        <PaymentScreen
          deal={deal}
          stage={stage}
          busy={screen.busy === "claim_paid"}
          onOpenChange={screen.setPaying}
          onClaim={async (via) => {
            const done = await screen.run("claim_paid", stage, { via });
            if (done) screen.setPaying(false);
            return done;
          }}
        />
      )}
    </Screen>
  );
};
