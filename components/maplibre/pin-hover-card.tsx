"use client";

// components/maplibre/pin-hover-card.tsx
//
// Поповер із короткою карткою біля одиночного маркера (десктоп, миша). Без кнопок, не ловить мишу:
// клік іде в маркер і відкриває повну картку. Місце: праворуч від портрета, якщо є, інакше ліворуч.

import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { PerformerShortCard } from "@/components/maplibre/performer-short-card";
import type { PinHoverTypes } from "@/components/maplibre/use-pin-hover";
import { CITIES } from "@/lib/map/cities";
import type { Performer } from "@/lib/map/types";
import { placeBeside } from "@/lib/maplibre/place-beside";
import { topEdgeUnderStack } from "@/lib/maplibre/stack-edges";

const GAP = 10;
const MARGIN = 16;

export const PinHoverCard = ({
  state,
  performer,
  containerRef,
}: {
  state: PinHoverTypes.State;
  performer: Performer;
  containerRef: RefObject<HTMLElement | null>;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const container = containerRef.current;
    if (!node || !container) return;
    const box = container.getBoundingClientRect();
    // Видима частина карти: контейнер буває ширшим чи вищим за вікно, і поповер ставився за краєм екрана.
    const bounds = { ...box.toJSON(), width: Math.min(box.width, window.innerWidth - box.left), height: Math.min(box.height, window.innerHeight - box.top) };
    const { width, height } = node.getBoundingClientRect();
    const { anchor } = state;
    const first = placeBeside({ anchor, size: { width, height }, bounds, gap: GAP, margin: MARGIN, topEdge: topEdgeUnderStack(bounds, anchor.left, width) });
    const topEdge = topEdgeUnderStack(bounds, first.left, width);
    const place = placeBeside({ anchor, size: { width, height }, bounds, gap: GAP, margin: MARGIN, topEdge });
    node.style.left = `${Math.round(place.left)}px`;
    node.style.top = `${Math.round(place.top)}px`;
    node.dataset.side = place.side;
    node.dataset.placed = "true";
  }, [state, containerRef]);

  return (
    <div ref={ref} aria-hidden className="pin-hover glass-panel">
      <PerformerShortCard performer={performer} cityName={CITIES.find((city) => city.id === performer.cityId)?.name} />
    </div>
  );
};
