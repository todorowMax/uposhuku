"use client";

// shadcn/ui Sheet (Radix Dialog), закастомлений під наш дизайн. На
// телефоні вибір тегів і подібні списки відкриваються шторкою знизу, бо
// випадайка під пальцем і клавіатурою нічого не вміщає. Стилі: .ui-sheet-*.

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  const ref = React.useRef<HTMLDivElement>(null);
  useKeyboardInset(ref);
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="ui-sheet-overlay" />
      <SheetPrimitive.Content
        ref={ref}
        data-slot="sheet-content"
        className={cn("ui-sheet", className)}
        {...props}
      >
        <span className="ui-sheet-grip" aria-hidden />
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
