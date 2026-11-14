"use client";

// components/composer/use-propose-target.ts
//
// Поле запиту й «Запропонувати роботу»: коли з'являється виконавець, для якого пишуть задачу, поле
// розгортається й отримує фокус; коли поле згорнулося, виконавця забуваємо.

import { useEffect, useEffectEvent } from "react";
import { proposeTargetStore, proposeTaskLabel } from "@/lib/requests/propose-work";
import { useStore } from "@/lib/store";

/** Підпис задачі для виконавця або null. `open` розгортає поле й ставить у нього фокус. */
export const useProposeTarget = (phase: string, open: () => void): string | null => {
  const target = useStore(proposeTargetStore);
  const activate = useEffectEvent(open);
  useEffect(() => {
    if (target) activate();
  }, [target]);
  useEffect(() => {
    if (phase === "closed") proposeTargetStore.set(null);
  }, [phase]);
  return target ? proposeTaskLabel(target.name) : null;
};
