// components/deals/deal-screen/parts/stage-timeline.tsx
//
// Етапи угоди списком; під активним етапом стоять його дії (передає екран).

import type { ReactNode } from "react";
import { Check } from "@/components/icons";
import { currentStage } from "@/lib/deals/machine";
import { daysWord, moneyIn } from "@/lib/deals/format";
import { stageText } from "@/lib/deals/summary";
import type { NextStepTypes } from "@/lib/deals/next-step";
import { dealCurrency, type Deal, type DealStage } from "@/lib/deals/types";

export const StageTimeline = ({ deal, role, actions }: { deal: Deal; role: NextStepTypes.Role; actions: (stage: DealStage) => ReactNode }) => {
  const current = currentStage(deal);
  return (
    <ol className="deal-timeline" aria-label="Етапи угоди">
      {deal.stages.map((item, index) => {
        const active = item.id === current?.id && deal.status === "accepted";
        return (
          <li key={item.id} data-state={item.status} data-active={active || undefined}>
            <span className="deal-dot">{item.status === "released" ? <Check className="size-3" /> : index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
                <span className="truncate">{item.title}</span>
                <span className="shrink-0 font-normal tabular-nums text-ink-muted">
                  {moneyIn(item.amount, dealCurrency(deal))} · {item.days} {daysWord(item.days)}
                </span>
              </p>
              <p className="text-xs text-ink-muted">{stageText(deal, item, role)}</p>
              {active && actions(item)}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
