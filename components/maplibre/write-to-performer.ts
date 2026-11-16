"use client";

// components/maplibre/write-to-performer.ts
//
// «Написати» з картки виконавця на карті, ще до того як відкрито його профіль. Увійшов: відкриваємо розмову з ним
// (порожня, поле «Опишіть задачу»). Гість спершу входить, а після входу розмову відкриє DirectChatSync.

import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { authFlowStore, sessionStore } from "@/lib/auth/client";
import { savePending } from "@/lib/requests/direct-chat";
import { EVENTS, track } from "@/lib/telemetry/track";

export const writeToPerformer = (performerId: string) => {
  track(EVENTS.chatOpened, { from: "map_card" });
  if (sessionStore.get().status !== "user") {
    savePending(performerId, "");
    authFlowStore.set({ mode: "login" });
    return;
  }
  inboxOpenStore.set({ conversationId: null, performerId });
};
