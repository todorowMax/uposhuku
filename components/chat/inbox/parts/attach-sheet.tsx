"use client";

// components/chat/inbox/parts/attach-sheet.tsx
//
// Шторка «+» біля поля повідомлення: «Оформити умови» й «Фото». Умови — це екран, тож шторка закривається,
// а потім відкривається він.

import { FileText, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";

const ITEM = "flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium text-ink hover:bg-line/40 disabled:opacity-50";

export const AttachSheet = ({
  open,
  photoDisabled,
  onOpenChange,
  onTerms,
  onPhoto,
}: {
  open: boolean;
  photoDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onTerms: () => void;
  onPhoto: () => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent aria-describedby={undefined}>
      <SheetTitle className="ui-sheet-title">Додати</SheetTitle>
      <SheetBody>
        <Button variant="bare" onClick={onTerms} className={ITEM}>
          <FileText aria-hidden className="size-5" strokeWidth={1.8} />
          Оформити умови
        </Button>
        <Button variant="bare" onClick={onPhoto} disabled={photoDisabled} className={ITEM}>
          <ImagePlus aria-hidden className="size-5" strokeWidth={1.8} />
          Фото
        </Button>
      </SheetBody>
    </SheetContent>
  </Sheet>
);
