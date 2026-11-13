"use client";

// Вікно умови запиту за чипом: на телефоні шторка (DESIGN.md, «Шари»), від 768 px поповер під чипом.
// Чип-кнопка передається елементом і лишається на місці.

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace ParamPopupTypes {
  export type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** Довгий список (міста): висока шторка з прокруткою. */
    tall?: boolean;
    /** Чип, що відкриває вікно (отримує `asChild`). */
    trigger: React.ReactElement;
    children: React.ReactNode;
  };
}

export const ParamPopup = ({ open, onOpenChange, title, tall = false, trigger, children }: ParamPopupTypes.Props) => {
  const desktop = useMediaQuery("(min-width: 768px)");
  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent aria-label={title} className="param-pop">
          {children}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent size={tall ? "tall" : "auto"} aria-describedby={undefined}>
        <SheetTitle className="ui-sheet-title">{title}</SheetTitle>
        <SheetDescription className="sr-only">Умова запиту необов&apos;язкова: можна нічого не вказувати.</SheetDescription>
        <SheetBody className="grid content-start gap-2">{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
};
