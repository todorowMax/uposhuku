"use client";

// lib/ui/use-keep-focus.ts
//
// Кнопка з `disabled={busy}` губить фокус, поки йде запит: після відповіді фокус лишається на <body>, і людина
// з клавіатури опиняється на початку сторінки. Тут: якщо в шарі вимкнули елемент у фокусі, а потім увімкнули,
// і фокус за цей час нікуди не потрапив, повертаємо його на цей елемент.

import { useEffect } from "react";

const focusIsLost = (): boolean => !document.activeElement || document.activeElement === document.body;

export const useKeepFocus = (root: HTMLElement | null, active = true) => {
  useEffect(() => {
    if (!active || !root) return;
    let held: HTMLElement | null = null;
    const observer = new MutationObserver((records) => {
      for (const { target } of records) {
        if (!(target instanceof HTMLElement)) continue;
        if (target.hasAttribute("disabled")) {
          if (document.activeElement === target) held = target;
        } else if (target === held) {
          held = null;
          if (focusIsLost()) target.focus();
        }
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, [root, active]);
};
