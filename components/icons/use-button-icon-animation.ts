"use client";

import { useEffect, type RefObject } from "react";

type IconControls = { start: (definition: string) => Promise<unknown> };

/** Play the icon animation for the whole button, including its label and padding. */
export function useButtonIconAnimation(controls: IconControls, iconRef: RefObject<Element | null>) {
  useEffect(() => {
    const button = iconRef.current?.closest("button");
    if (!button) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Кнопку можуть прибрати, поки вона в фокусі: браузер шле focusout уже після
    // розмонтування, і framer-motion кидає помилку. Анімація іконки того не варта.
    const run = (definition: string) => {
      try {
        void controls.start(definition);
      } catch {
        // Іконки вже немає.
      }
    };
    const start = () => {
      if (!reducedMotion.matches) run("animate");
    };
    const stop = () => run("normal");
    button.addEventListener("pointerenter", start);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("focusin", start);
    button.addEventListener("focusout", stop);
    if (button.matches(":hover")) start();
    return () => {
      button.removeEventListener("pointerenter", start);
      button.removeEventListener("pointerleave", stop);
      button.removeEventListener("focusin", start);
      button.removeEventListener("focusout", stop);
    };
  }, [controls, iconRef]);
}
