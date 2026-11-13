"use client";

// Закрили редактор із незбереженими змінами: швидкий вибір, тому шторка (DESIGN.md, «Шари»), а не блок усередині форми.

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export namespace ProfileCloseSheetTypes {
  export type Props = {
    open: boolean;
    busy: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveAndLeave: () => void;
    onLeave: () => void;
  };
}

export const ProfileCloseSheet = ({ open, busy, onOpenChange, onSaveAndLeave, onLeave }: ProfileCloseSheetTypes.Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetTitle className="ui-sheet-title">Є незбережені зміни</SheetTitle>
      <SheetDescription className="sr-only">Збережіть зміни, вийдіть без збереження або поверніться до профілю.</SheetDescription>
      <SheetBody className="grid gap-2">
        <Button disabled={busy} onClick={onSaveAndLeave}>
          Зберегти й вийти
        </Button>
        <Button variant="secondary" onClick={onLeave}>
          Не зберігати
        </Button>
        <Button variant="link" onClick={() => onOpenChange(false)}>
          Лишитись
        </Button>
      </SheetBody>
    </SheetContent>
  </Sheet>
);
