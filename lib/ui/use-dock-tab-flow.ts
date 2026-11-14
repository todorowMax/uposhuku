"use client";

// lib/ui/use-dock-tab-flow.ts
//
// Панель угоди й чат стоять поруч як одне вікно (lib/ui/chat-window.ts), але кожне тримає Tab у собі (Radix
// FocusScope з `loop`). Тут Tab з останнього елемента панелі йде на перший елемент чату, з чату назад у панель, а
// Shift+Tab навпаки: порядок збігається з тим, що видно (панель ліворуч, чат праворуч).

import { useEffect } from "react";
import { CHAT_SELECTOR } from "@/lib/ui/chat-window";

const TABBABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const tabbables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");

export const useDockTabFlow = (panel: HTMLElement | null, active: boolean) => {
  useEffect(() => {
    if (!panel || !active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const chat = document.querySelector<HTMLElement>(CHAT_SELECTOR);
      const current = document.activeElement;
      if (!chat || !(current instanceof HTMLElement)) return;
      const inPanel = panel.contains(current);
      if (!inPanel && !chat.contains(current)) return;
      const own = tabbables(inPanel ? panel : chat);
      const other = tabbables(inPanel ? chat : panel);
      if (own.length === 0 || other.length === 0) return;
      if (current !== (event.shiftKey ? own[0] : own[own.length - 1])) return;
      event.preventDefault();
      event.stopPropagation();
      (event.shiftKey ? other[other.length - 1] : other[0])?.focus();
    };
    // Фаза перехоплення: раніше за обробник Radix, що замикає Tab у своєму вікні.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [panel, active]);
};
