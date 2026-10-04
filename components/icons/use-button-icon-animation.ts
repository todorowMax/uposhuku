"use client";

import { useEffect, type RefObject } from "react";

type IconControls = { start: (definition: string) => Promise<unknown> };

/** Play the icon animation for the whole button, including its label and padding. */
export function useButtonIconAnimation(controls: IconControls, iconRef: RefObject<Element | null>) {
  useEffect(() => {
    const button = iconRef.current?.closest("button");
    if (!button) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = () => {
      if (!reducedMotion.matches) void controls.start("animate");
    };
    const stop = () => void controls.start("normal");
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
