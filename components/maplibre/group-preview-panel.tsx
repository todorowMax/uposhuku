"use client";

// components/maplibre/group-preview-panel.tsx
//
// Содержимое списка людей группы под курсором (десктоп): заголовок, прокручиваемая стопка рядков и
// коротка картка людини, на яку наведено мишу чи фокус. Саму панель (місце, поява, відстеження
// курсора) веде сцена; тут лише розмітка. Картка не ловить мишу, щоб перехід курсора до неї не
// закривав список.

import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject, UIEventHandler } from "react";
import { PerformerShortCard } from "@/components/maplibre/performer-short-card";
import { ChevronRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CITIES } from "@/lib/map/cities";
import { avatarBackground } from "@/lib/map/avatar-style";
import { groupTitle } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";
import type { MapRequest } from "@/lib/feed/types";

const PREVIEW_GAP = 12;
const EDGE = 16;

export namespace GroupPreviewPanelTypes {
  export interface Props {
    members: Performer[];
    requests: MapRequest[];
    /** Список прокручується, і сцена рахує стопку за його scrollTop. */
    listRef: RefObject<HTMLUListElement | null>;
    /** Панель, від якої зліва чи справа стоїть коротка картка. */
    panelRef: RefObject<HTMLDivElement | null>;
    onScroll: UIEventHandler<HTMLUListElement>;
    onOpenPerson: (performer: Performer) => void;
    onOpenRequest: (request: MapRequest) => void;
  }
}

const scrollRowIntoStack = (list: HTMLUListElement | null, item: HTMLElement | null) => {
  const first = list?.querySelector("li");
  if (!list || !item || !first) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: item.offsetTop - first.offsetTop, behavior: reduce ? "auto" : "smooth" });
};

export const GroupPreviewPanel = ({ members, requests, listRef, panelRef, onScroll, onOpenPerson, onOpenRequest }: GroupPreviewPanelTypes.Props) => {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hovered = members.find((performer) => performer.id === hoverId);

  // Картка стоїть навпроти рядка, з зовнішнього боку панелі (від групи).
  useLayoutEffect(() => {
    const card = cardRef.current;
    const panel = panelRef.current;
    const row = hoverId ? panel?.querySelector<HTMLElement>(`[data-person="${CSS.escape(hoverId)}"]`) : null;
    if (!card || !panel || !row) return;
    const panelBox = panel.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const { width, height } = card.getBoundingClientRect();
    // Рахуємо від вікна, а не від батька панелі: батько (сцена карти) буває ширшим за видиму частину, і картка праворуч обрізалась краєм екрана.
    const fitsRight = panelBox.right + PREVIEW_GAP + width <= window.innerWidth - EDGE;
    const fitsLeft = panelBox.left - PREVIEW_GAP - width >= EDGE;
    const right = fitsRight || !fitsLeft;
    const top = Math.min(Math.max(rowBox.top - panelBox.top + rowBox.height / 2 - height / 2, 0), Math.max(0, panelBox.height - height));
    card.style.left = `${right ? panelBox.width + PREVIEW_GAP : -(width + PREVIEW_GAP)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.dataset.placed = "true";
  }, [hoverId, panelRef]);

  return (
    <>
      <p className="group-preview-title">{groupTitle(members.length, requests.length)}</p>
      <ul ref={listRef} className="group-preview-list" style={{ "--rows": members.length + requests.length } as React.CSSProperties} onScroll={onScroll} aria-label="Виконавці й запити у групі">
        {members.map((performer) => (
          <li key={performer.id} data-person={performer.id}>
            <Button
              variant="bare"
              className="group-preview-row"
              onClick={() => onOpenPerson(performer)}
              onPointerEnter={() => setHoverId(performer.id)}
              onFocus={(event) => {
                setHoverId(performer.id);
                scrollRowIntoStack(listRef.current, event.currentTarget.parentElement);
              }}
            >
              <span aria-hidden className="group-preview-avatar" style={avatarBackground(performer, 48)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight text-ink">{performer.name}</span>
                <span className="block truncate text-xs leading-snug text-ink-muted">{performer.specialty}</span>
              </span>
              <ChevronRight aria-hidden className="group-preview-chevron size-4 shrink-0" />
            </Button>
          </li>
        ))}
        {requests.map((request) => (
          <li key={request.id}>
            <Button variant="bare" className="group-preview-row" onClick={() => onOpenRequest(request)}>
              <span aria-hidden className="group-preview-request-avatar">$</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight text-ink">Ваш запит</span>
                <span className="block truncate text-xs leading-snug text-ink-muted">{request.text}</span>
              </span>
              <ChevronRight aria-hidden className="group-preview-chevron size-4 shrink-0" />
            </Button>
          </li>
        ))}
      </ul>
      {hovered && (
        <div key={hovered.id} ref={cardRef} aria-hidden className="group-preview-card glass-panel">
          <PerformerShortCard performer={hovered} cityName={CITIES.find((city) => city.id === hovered.cityId)?.name} />
        </div>
      )}
    </>
  );
};
