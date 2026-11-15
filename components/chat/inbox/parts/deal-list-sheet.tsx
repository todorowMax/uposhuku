"use client";

// components/chat/inbox/parts/deal-list-sheet.tsx
//
// Шторка зі списком угод цієї розмови: швидкий вибір, далі відкривається екран угоди.

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { needsMe, type NextStepTypes } from "@/lib/deals/next-step";
import { dealAmount, dealName, dealState } from "@/lib/deals/summary";
import type { Deal } from "@/lib/deals/types";

export const DealListSheet = ({
  open,
  deals,
  role,
  onOpenChange,
  onPick,
  onNew,
}: {
  open: boolean;
  deals: Deal[];
  role: NextStepTypes.Role;
  onOpenChange: (open: boolean) => void;
  onPick: (deal: Deal) => void;
  onNew: () => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent aria-describedby={undefined}>
      <SheetTitle className="ui-sheet-title">Угоди</SheetTitle>
      <SheetBody>
        <ul className="grid gap-1">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Button variant="bare" onClick={() => onPick(deal)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-line/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{dealName(deal)}</span>
                  <span className="block truncate text-xs text-ink-muted">{dealState(deal, role)}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink-muted">{dealAmount(deal)}</span>
                {needsMe(deal, role) && <span role="img" aria-label="Чекає на вас" className="size-2 shrink-0 rounded-full bg-brand" />}
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="link" onClick={onNew} className="mt-2 text-sm">
          Нова угода
        </Button>
      </SheetBody>
    </SheetContent>
  </Sheet>
);
