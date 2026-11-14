"use client";

// lib/ui/use-panel-swipe.ts
//
// Свайп вниз згортає нижню панель карти («Запити для вас», «Пропозиції») в язичок, як кнопка «Згорнути».
// Жест той самий, що в шторці (use-sheet-swipe.ts); різниця лише в межі: ці панелі лежать знизу до 1024 px,
// а далі стоять колонкою праворуч. Після жесту панель їде вниз і лише тоді згортається.

import { useCallback, useEffect, useRef } from "react";
import { useSheetSwipe } from "@/lib/ui/use-sheet-swipe";

/** Від цієї ширини панель колонка праворуч, а не шторка знизу (як `.offers-panel` у globals.css). */
export const PANEL_WIDE_QUERY = "(min-width: 1024px)";
/** Скільки панель їде вниз після свайпу; збігається з transition `.offers-panel`. */
const EXIT_MS = 200;

export const usePanelSwipe = (panel: HTMLElement | null, collapse: () => void) => {
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const dismiss = useCallback(() => {
    if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      collapse();
      return;
    }
    panel.style.setProperty("--sheet-drag", `${panel.offsetHeight}px`);
    timer.current = window.setTimeout(collapse, EXIT_MS);
  }, [panel, collapse]);
  useSheetSwipe(panel, dismiss, PANEL_WIDE_QUERY);
};
