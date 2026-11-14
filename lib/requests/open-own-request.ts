// lib/requests/open-own-request.ts
//
// «Відкрити пропозиції» на власному запиті: з карти запитів чи зі стрічки виконавця
// людина повертається в режим замовника, де праворуч відгуки на цей запит.

import { activeRequestStore, composingStore } from "@/lib/auth/client";
import { mapSelectedRequest, setMapMode } from "@/lib/feed/map-requests";
import { offersCollapsedStore } from "@/lib/requests/offers";

export const openOwnRequestOffers = (requestId: string) => {
  mapSelectedRequest.set(null);
  activeRequestStore.set(requestId);
  composingStore.set(false);
  setMapMode("performers");
  offersCollapsedStore.set(false);
};
