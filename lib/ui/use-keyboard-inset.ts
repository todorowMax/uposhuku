"use client";

// lib/ui/use-keyboard-inset.ts
//
// Клавіатура iOS не зменшує сторінку, а лягає зверху, тож fixed-панелі опиняються під нею.
// Стежимо за visualViewport: `--kb` на елементі дорівнює висоті клавіатури, `--vvh` — видимій
// висоті. Панелі підіймаються на `--kb` і обмежують висоту за `--vvh`.

import { useEffect, type RefObject } from "react";

export function useKeyboardInset(element: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const target = element.current;
    if (!active || !viewport || !target) return;
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      target.style.setProperty("--kb", `${Math.round(covered)}px`);
      target.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [element, active]);
}
