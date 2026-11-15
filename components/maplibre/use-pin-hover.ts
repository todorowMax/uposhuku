"use client";

// components/maplibre/use-pin-hover.ts
//
// Коротка картка над одиночним маркером при наведенні миші: з'являється після короткої паузи,
// зникає, щойно курсор пішов з маркера. Рішення «який маркер» ухвалює сцена (showLens/hideLens),
// тут лише таймер і стан.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Box } from "@/lib/maplibre/place-beside";

/** Скільки курсор стоїть на маркері, перш ніж з'явиться картка: прохід повз не мигає. */
export const PIN_HOVER_DELAY_MS = 200;

export namespace PinHoverTypes {
  export interface State {
    id: string;
    /** Збільшений портрет на екрані, px відносно карти. */
    anchor: Box;
  }
}

export const usePinHover = () => {
  const [state, setState] = useState<PinHoverTypes.State | null>(null);
  const timerRef = useRef(0);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    setState(null);
  }, []);

  const show = useCallback((next: PinHoverTypes.State) => {
    window.clearTimeout(timerRef.current);
    setState(null);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = 0;
      setState(next);
    }, PIN_HOVER_DELAY_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { state, show, hide };
};
