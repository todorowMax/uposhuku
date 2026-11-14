"use client";

// components/maplibre/use-propose-work.ts
//
// Кнопка «Запропонувати роботу» на картці виконавця. Рішення («угода» чи «поле запиту») дає
// lib/requests/propose-work.ts; тут лише дії: відкрити розмову з наміром «угода» або розгорнути поле.

import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { requestsStore, sessionStore } from "@/lib/auth/client";
import { proposeDealIntentStore, proposeTargetStore, proposeTaskLabel, proposeWorkAction } from "@/lib/requests/propose-work";
import { useStore } from "@/lib/store";

const PHONE_MAX = 640;

export const useProposeWork = (performer: { id: string; name: string } | undefined, closeCard: () => void, setNotice: (text: string | null) => void) => {
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  return () => {
    if (!performer) return;
    const phone = window.innerWidth < PHONE_MAX;
    if (proposeWorkAction({ signedIn: session.status === "user", requests }) === "deal") {
      // Далі працює розмова: вона сама покаже «Запропонувати угоду» або умови, як рядок угоди.
      closeCard();
      proposeDealIntentStore.set(performer.id);
      inboxOpenStore.set({ conversationId: null, performerId: performer.id });
      return;
    }
    // Поле запиту розгортається само, коли в сховищі з'являється виконавець; на телефоні картка не заважає полю.
    if (phone) closeCard();
    else setNotice(`${proposeTaskLabel(performer.name)}: опишіть її в полі запиту.`);
    proposeTargetStore.set({ name: performer.name });
  };
};
