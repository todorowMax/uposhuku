"use client";

// components/deals/deal-screen/parts/release-sheet.tsx
//
// Підтвердження приймання роботи шторкою (одна дія): «Так, все добре» / «Ні», а для виплат від 10 000 ₴ у безпечній
// угоді один код з пошти. Результат здачі лишається на екрані під шторкою.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ReleaseCodeBox } from "@/components/deals/release-code-box";
import { money } from "@/lib/deals/format";
import { releaseNeedsCode } from "@/lib/deals/limits";
import { payoutOf } from "@/lib/deals/machine";
import type { Deal, DealStage } from "@/lib/deals/types";
import type { DealScreenState } from "../use-deal-screen";

export const ReleaseSheet = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  const safe = deal.method === "safe";
  const busy = screen.busy === "release";
  const withCode = safe && releaseNeedsCode(stage.amount);
  return (
    <Sheet open={screen.confirmRelease} onOpenChange={(open) => !open && screen.setConfirmRelease(false)}>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="ui-sheet-title">{withCode ? "Код приймання" : "Прийняти роботу?"}</SheetTitle>
        <SheetBody>
          {withCode ? (
            <ReleaseCodeBox dealId={deal.id} amount={money(payoutOf(stage.amount))} busy={busy} onConfirm={(code) => screen.run("release", stage, { code })} />
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-ink">
                {safe ? `Виплатити ${money(payoutOf(stage.amount))} виконавцю?` : "Підтвердити, що роботу прийнято?"} Скасувати це не вийде.
              </p>
              <div className="flex gap-2">
                <Button variant="offer" disabled={busy} onClick={() => void screen.run("release", stage)} className="flex-1">
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Так, все добре
                </Button>
                <Button variant="quiet" onClick={() => screen.setConfirmRelease(false)}>
                  Ні
                </Button>
              </div>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
