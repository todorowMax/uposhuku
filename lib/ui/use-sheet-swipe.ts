"use client";

// lib/ui/use-sheet-swipe.ts
//
// Свайп вниз закриває шторку. Тягнемо весь вміст, але лише коли палець починає рух зверху прокручуваного
// списку (scrollTop 0) і не з поля вводу. Зсув іде змінною `--sheet-drag` (transform), на час жесту
// ставиться `data-dragging`, щоб CSS не згладжував рух. Від 768 px шторка маленьке вікно, жест вимкнено.

import { useEffect, useRef } from "react";
import { dragOffset, shouldDismiss, startsDrag } from "@/lib/ui/sheet-swipe";

const DESKTOP = "(min-width: 768px)";

const scrolledAway = (from: EventTarget | null, root: HTMLElement): boolean => {
  for (let node = from instanceof HTMLElement ? from : null; node && node !== root; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
};

const isTextField = (target: EventTarget | null): boolean => target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true]") !== null;

export const useSheetSwipe = (root: HTMLElement | null, onDismiss: () => void) => {
  const onClose = useRef(onDismiss);
  useEffect(() => {
    onClose.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!root) return;
    let start: { x: number; y: number; time: number } | null = null;
    let dragging = false;
    let offset = 0;

    const reset = () => {
      start = null;
      dragging = false;
      offset = 0;
      root.removeAttribute("data-dragging");
      root.style.removeProperty("--sheet-drag");
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const blocked = event.touches.length !== 1 || window.matchMedia(DESKTOP).matches || isTextField(event.target) || scrolledAway(event.target, root);
      start = blocked || !touch ? null : { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!dragging) {
        if (dy < 0 || (Math.abs(dx) > 8 && Math.abs(dx) >= dy)) {
          start = null;
          return;
        }
        if (!startsDrag(dx, dy)) return;
        dragging = true;
        root.setAttribute("data-dragging", "");
      }
      // Без preventDefault браузер прокручував би сторінку, поки шторка їде.
      if (event.cancelable) event.preventDefault();
      offset = dragOffset(dy);
      root.style.setProperty("--sheet-drag", `${offset}px`);
    };
    const onEnd = (event: TouchEvent) => {
      if (!start || !dragging) return reset();
      const dismiss = shouldDismiss(offset, event.timeStamp - start.time, root.getBoundingClientRect().height);
      if (dismiss) {
        // Шторка їде вниз від поточного місця: знімаємо жест, але зсув лишаємо до кінця анімації закриття.
        root.removeAttribute("data-dragging");
        start = null;
        dragging = false;
        onClose.current();
        return;
      }
      reset();
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", reset);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", reset);
    };
  }, [root]);
};
