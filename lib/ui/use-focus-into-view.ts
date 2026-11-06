"use client";

// lib/ui/use-focus-into-view.ts
//
// Поле у фокусі не ховається під клавіатурою: коли воно отримує фокус і коли клавіатура змінює видиму
// висоту, прокручуємо середину екрана так, щоб поле було видно. Рух плавний, крім `prefers-reduced-motion`.

import { useEffect } from "react";

const FIELDS = "input, textarea, select, [contenteditable=true]";

export const useFocusIntoView = (root: HTMLElement | null, active = true) => {
  useEffect(() => {
    if (!active || !root) return;
    const reveal = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !root.contains(focused) || !focused.matches(FIELDS)) return;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      focused.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    };
    let timer: number | undefined;
    // Клавіатура з'їжджає за ~250 мс: чекаємо, інакше рахуємо за ще не зміненою висотою.
    const onFocusIn = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, 280);
    };
    const viewport = window.visualViewport;
    root.addEventListener("focusin", onFocusIn);
    viewport?.addEventListener("resize", reveal);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("focusin", onFocusIn);
      viewport?.removeEventListener("resize", reveal);
    };
  }, [root, active]);
};
