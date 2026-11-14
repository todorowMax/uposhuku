"use client";

// Закрили правку запиту з незбереженими змінами: швидкий вибір, тому шторка (DESIGN.md, «Шари»).

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export namespace EditRequestCloseSheetTypes {
  export type Props = {
    open: boolean;
    busy: boolean;
    /** Зберегти можна не завжди: текст закороткий. */
    canSave: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveAndLeave: () => void;
    onLeave: () => void;
  };
}

export const EditRequestCloseSheet = ({ open, busy, canSave, onOpenChange, onSaveAndLeave, onLeave }: EditRequestCloseSheetTypes.Props) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent>
      <SheetTitle className="ui-sheet-title">Є незбережені зміни</SheetTitle>
      <SheetDescription className="sr-only">Збережіть зміни запиту, вийдіть без збереження або поверніться до правки.</SheetDescription>
      <SheetBody className="grid gap-2">
        <Button disabled={busy || !canSave} onClick={onSaveAndLeave}>
          {busy && <Loader2 className="size-4 animate-spin" />}
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
