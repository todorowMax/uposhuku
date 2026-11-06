// components/deals/deal-screen/parts/proposal-notice.tsx
//
// Умови ще не прийняті: що відбувається й що можна зробити (відхилити, скасувати, відкликати).
// Кнопка «Прийняти» стоїть унизу екрана, тут лише другорядні дії.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DealTerms } from "@/components/deals/deal-terms";
import { daysWord } from "@/lib/deals/format";
import { dealAmount } from "@/lib/deals/summary";
import type { Deal } from "@/lib/deals/types";
import type { NextStepTypes } from "@/lib/deals/next-step";
import type { DealScreenState } from "../use-deal-screen";

const stagesText = (deal: Deal): string =>
  deal.stages.length === 1 ? `, ${deal.stages[0].days} ${daysWord(deal.stages[0].days)}` : `, ${deal.stages.length} ${deal.stages.length < 5 ? "етапи" : "етапів"}`;

export const ProposalNotice = ({ deal, role, screen }: { deal: Deal; role: NextStepTypes.Role; screen: DealScreenState.Value }) => {
  const mine = (deal.proposedBy ?? "customer") === role;
  const { busy } = screen;
  if (mine) {
    return (
      <div className="deal-wait">
        <Loader2 className="size-4 animate-spin text-ink-muted" />
        <p>
          Чекаємо, поки {role === "customer" ? deal.performer.name : "замовник"} {role === "customer" ? "погодиться" : "відповість"}. Зазвичай це кілька хвилин.
        </p>
        <Button
          variant="link"
          disabled={busy !== null}
          onClick={() => void (role === "customer" ? screen.run("cancel") : screen.act("withdraw"))}
          className="text-xs"
        >
          {role === "customer" ? "Скасувати пропозицію" : "Відкликати умови"}
        </Button>
      </div>
    );
  }
  return (
    <div className="deal-wait" data-incoming>
      <div className="grid w-full gap-2">
        {role === "customer" ? (
          <p>
            {deal.performer.name} пропонує умови: {dealAmount(deal)}
            {stagesText(deal)}.
          </p>
        ) : (
          <>
            <p>Замовник пропонує угоду на {dealAmount(deal)}.</p>
            <DealTerms deal={deal} />
          </>
        )}
        <Button variant="link" disabled={busy !== null} onClick={() => void screen.answer("decline")} className="w-fit text-sm">
          Відхилити
        </Button>
      </div>
    </div>
  );
};
