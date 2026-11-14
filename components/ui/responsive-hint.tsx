"use client";

// components/ui/responsive-hint.tsx
//
// Підказка за кнопкою «?» або посиланням: на телефоні шторка знизу (палець закриває поповер, а тап повз
// закриває шторку), від 768 px поповер біля кнопки. Для підказок, які читають і закривають
// (DESIGN.md, розділ «Шари»). Кнопка-тригер передається елементом, вона ж лишається на місці.
//
//   <ResponsiveHint title="Що входить у комісію" trigger={<Button variant="icon" aria-label="Що входить у комісію">?</Button>}>
//     Сервіс 5%, банк до 2%.
//   </ResponsiveHint>

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace ResponsiveHintTypes {
  export type Props = {
    /** Елемент-кнопка, що відкриває підказку (отримує `asChild`). */
    trigger: React.ReactElement;
    /** Заголовок шторки й імʼя поповера. */
    title: string;
    /** Макс. ширина поповера на десктопі (клас розкладки, наприклад `max-w-64`). */
    popoverClassName?: string;
    children: React.ReactNode;
  };
}

const ResponsiveHint = ({ trigger, title, popoverClassName, children }: ResponsiveHintTypes.Props) => {
  const desktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = React.useState(false);
  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent aria-label={title} className={cn("max-w-64 text-sm", popoverClassName)}>
          {/* Сам поповер без відступів (його ж беруть списки вибору): відступ дає підказка. */}
          <div className="p-4">{children}</div>
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="ui-sheet-title">{title}</SheetTitle>
        <SheetBody className="text-sm">{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
};

export { ResponsiveHint };
