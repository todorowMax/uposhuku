"use client";

// components/deals/deal-screen/parts/received-sheet.tsx
//
// Підтвердження виконавця, що гроші за етап надійшли (прямий переказ): одна дія шторкою, як приймання роботи.
// Після неї етап можна здати; для замовника це й є момент, коли площадка нараховує комісію, якщо він сам не позначив оплату.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { DealScreenState } from "../use-deal-screen";

export const ReceivedSheet = ({ screen }: { screen: DealScreenState.Value }) => {
  const busy = screen.busy === "confirm_paid";
  return (
    <Sheet open={screen.confirmReceived} onOpenChange={(open) => !open && screen.setConfirmReceived(false)}>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="ui-sheet-title">Оплату отримано?</SheetTitle>
        <SheetBody>
          <div className="grid gap-3">
            <p className="text-sm text-ink">Підтвердіть, що гроші за етап надійшли. Після цього можна здати етап.</p>
            <div className="flex gap-2">
              <Button variant="offer" disabled={busy} onClick={() => void screen.act("confirm_paid")} className="flex-1">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Так, гроші надійшли
              </Button>
              <Button variant="quiet" onClick={() => screen.setConfirmReceived(false)}>
                Ні
              </Button>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
