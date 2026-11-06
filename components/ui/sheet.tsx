"use client";

// shadcn/ui Sheet (Radix Dialog), закастомлений під наш дизайн. Це «шторка» з DESIGN.md (розділ «Шари»):
// швидка дія на телефоні, один рівень, висота за вмістом до 85 %, `size="tall"` для довгого списку.
// Закривається свайпом вниз, тапом повз, Escape й системним «назад». Від 768 px це маленьке вікно по центру.
// Стилі: .ui-sheet-*.

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { useReturnFocus } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import { useLayerHistory } from "@/lib/ui/use-layer-history";
import { useSheetSwipe } from "@/lib/ui/use-sheet-swipe";

const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

const SheetContext = React.createContext<() => void>(() => undefined);

const Sheet = ({ open, defaultOpen = false, onOpenChange, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) => {
  const [inner, setInner] = React.useState(defaultOpen);
  const value = open ?? inner;
  const controlled = open !== undefined;
  const close = React.useCallback(() => {
    if (!controlled) setInner(false);
    onOpenChange?.(false);
  }, [controlled, onOpenChange]);
  const set = (next: boolean) => {
    if (!controlled) setInner(next);
    onOpenChange?.(next);
  };
  useLayerHistory(value, close);
  return (
    <SheetContext.Provider value={close}>
      <SheetPrimitive.Root open={value} onOpenChange={set} {...props} />
    </SheetContext.Provider>
  );
};

export namespace SheetTypes {
  export type Size = "auto" | "tall";
  export type ContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & { size?: Size };
}

// Хуки живуть тут, а не в SheetContent: Ref на Content Radix не віддає, тож вузол шторки беремо як батька сітки: callback-ref дає його, щойно він змонтований.
const SheetPanel = ({ className, children, size = "auto", onOpenAutoFocus, onCloseAutoFocus, ...props }: SheetTypes.ContentProps) => {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const findPanel = React.useCallback((grip: HTMLSpanElement | null) => setNode((grip?.parentElement as HTMLDivElement | null) ?? null), []);
  const dismiss = React.useContext(SheetContext);
  useKeyboardInset(node);
  useSheetSwipe(node, dismiss);
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <SheetPrimitive.Content data-slot="sheet-content" data-size={size} className={cn("ui-sheet", className)} {...focus} {...props}>
      <span ref={findPanel} className="ui-sheet-grip" aria-hidden />
      {children}
    </SheetPrimitive.Content>
  );
};

const SheetContent = (props: SheetTypes.ContentProps) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="ui-sheet-overlay" />
    <SheetPanel {...props} />
  </SheetPrimitive.Portal>
);

/** Єдина прокручувана частина шторки: заголовок над нею стоїть на місці. */
const SheetBody = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("ui-sheet-body", className)} {...props} />;

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
