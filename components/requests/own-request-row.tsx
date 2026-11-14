"use client";

import { MapPin } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { MapRequest } from "@/lib/feed/types";
import { openOwnRequestOffers } from "@/lib/requests/open-own-request";

/**
 * Власний відкритий запит нагорі стрічки виконавця: замовник, який водночас
 * виконавець, бачить, що запит живий і скільки на нього відгуків. Відгукнутися
 * на свій запит не можна, тож замість форми кнопка до пропозицій.
 */
export const OwnRequestRow = ({ item }: { item: Pick<MapRequest, "id" | "text" | "place" | "responses"> }) => (
  <article className="feed-own" aria-label="Ваш запит">
    <div className="flex items-center justify-between gap-2">
      <span className="feed-own-badge">Ваш запит</span>
      <span className="feed-own-place">
        <MapPin className="size-3" />
        {item.place}
      </span>
    </div>
    <p className="feed-own-text">{item.text}</p>
    <div className="mt-2.5 flex items-center justify-between gap-2">
      <span className="feed-own-meta">{item.responses > 0 ? `Відгукнулись: ${item.responses}` : "Ще без відгуків"}</span>
      <Button variant="quiet" onClick={() => openOwnRequestOffers(item.id)}>
        Відкрити пропозиції
      </Button>
    </div>
  </article>
);
