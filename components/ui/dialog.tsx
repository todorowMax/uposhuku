"use client";

// shadcn/ui Dialog (Radix), закастомлений під наш дизайн. Тримає фокус усередині,
// повертає його на те, що було в фокусі до відкриття, закриває по Esc і кліку по фону,
// ховає решту сторінки від скрінрідера. Вигляд самої панелі задає className
// (.auth-panel, .place-panel, .pe-overlay), а шар під нею: variant.
//   center: картка по центру над затемненою картою;
//   bottom: шторка знизу на телефоні, по центру від 640 px;
//   full:   панель на весь екран, без затемнення;
//   panel:  плаваюче вікно без затемнення й порталу (разом з modal={false}): фокус іде всередину
//           і повертається, Esc закриває, а карта під ним лишається живою.
// Стилі шару: .ui-dialog-layer у globals.css.

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

// Останній елемент поза діалогами й меню, де був фокус. Меню закривається, коли обрано пункт, що відкриває діалог,
// і фокус на мить лишається на <body>: тоді повертаємо на кнопку, що відкрила меню.
const OVERLAY_SELECTOR = "[data-slot=dialog-content],[data-slot=dropdown-menu-content],[data-slot=popover-content],[data-slot=sheet-content]";
let lastOutside: HTMLElement | null = null;
const trackFocus = () => {
  if (typeof document === "undefined") return;
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target !== document.body && !target.closest(OVERLAY_SELECTOR)) lastOutside = target;
  });
};
trackFocus();

const LAYER_SELECTOR = "[data-slot=dialog-content],[data-slot=sheet-content]";
const FOCUSABLE = "button:not([disabled]),[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])";

/** Кнопка, що відкрила шар, зникла (дія змінила екран): фокус іде в найвищий шар, що лишився, а не на <body>. */
const focusTopLayer = (): void => {
  const layers = document.querySelectorAll<HTMLElement>(LAYER_SELECTOR);
  const top = layers[layers.length - 1];
  (top?.querySelector<HTMLElement>(FOCUSABLE) ?? top)?.focus();
};

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  variant?: "center" | "bottom" | "full" | "panel";
};

type FocusHandlers = Pick<React.ComponentProps<typeof DialogPrimitive.Content>, "onOpenAutoFocus" | "onCloseAutoFocus">;

/**
 * Radix возвращает фокус лише на DialogTrigger, а наші шари відкриває стан (store, кнопка в низу екрана). Тож
 * запам'ятовуємо, що було в фокусі перед відкриттям, і повертаємо туди ж, якщо воно ще в документі.
 * Працює для діалогів, екранів і шторок.
 */
const useReturnFocus = ({ onOpenAutoFocus, onCloseAutoFocus }: FocusHandlers): Required<FocusHandlers> => {
  const opener = React.useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement;
      const ephemeral = !(active instanceof HTMLElement) || active === document.body || active.closest("[data-slot=dropdown-menu-content],[data-slot=popover-content]");
      opener.current = ephemeral ? lastOutside : (active as HTMLElement);
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (opener.current?.isConnected) return opener.current.focus();
      if (document.querySelector(LAYER_SELECTOR)) return focusTopLayer();
      if (lastOutside?.isConnected) lastOutside.focus();
    },
  };
};

const DialogContent = ({ variant = "center", children, onOpenAutoFocus, onCloseAutoFocus, ...props }: DialogContentProps) => {
  const handlers = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  const content = (
    <DialogPrimitive.Content data-slot="dialog-content" data-variant={variant} {...handlers} {...props}>
      {children}
    </DialogPrimitive.Content>
  );
  if (variant === "panel") return content;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-dialog-layer" data-variant={variant}>
        {content}
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
};

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger, useReturnFocus };
