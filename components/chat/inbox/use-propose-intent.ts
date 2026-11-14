"use client";

// components/chat/inbox/use-propose-intent.ts
//
// Розмову відкрили кнопкою «Запропонувати роботу» на картці виконавця: щойно угоди пари завантажені,
// відкриваємо те саме, що відкриває рядок угоди (угоду, форму за відгуком або «Оформити умови»).

import { useEffect, useEffectEvent } from "react";
import { proposeDealIntentStore } from "@/lib/requests/propose-work";
import { useStore } from "@/lib/store";

export const useProposeIntent = (performerId: string, ready: boolean, openDeals: () => void) => {
  const intent = useStore(proposeDealIntentStore);
  const open = useEffectEvent(openDeals);
  useEffect(() => {
    if (intent !== performerId || !ready) return;
    proposeDealIntentStore.set(null);
    open();
  }, [intent, performerId, ready]);
};
