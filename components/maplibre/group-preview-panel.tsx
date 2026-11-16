"use client";

// components/maplibre/group-preview-panel.tsx
//
// Список людей групи під курсором (десктоп): заголовок, прокручувана стопка рядків і під нею коротка картка
// активного рядка, тобто того, що прокрутка поставила нагору (data-centered від сцени). Картка частина панелі,
// а не окреме вікно збоку: вона стоїть там, де курсор, не закриває маркер і не залежить від ширини вікна.
// Картка інтерактивна («Написати»), а зона панелі для курсора доходить до її низу: тягнучись до кнопки, список не зникає.
// Наведення мишею картку не перемикає. Саму панель (місце, поява, відстеження курсора) веде сцена.

import { useState } from "react";
import type { RefObject, UIEventHandler } from "react";
import { PerformerShortCard } from "@/components/maplibre/performer-short-card";
import { ChevronRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CITIES } from "@/lib/map/cities";
import { avatarBackground } from "@/lib/map/avatar-style";
import { groupTitle } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";
import type { MapRequest } from "@/lib/feed/types";

export namespace GroupPreviewPanelTypes {
  export interface Props {
    members: Performer[];
    requests: MapRequest[];
    /** Список прокручується, і сцена рахує стопку за його scrollTop. */
    listRef: RefObject<HTMLUListElement | null>;
    onScroll: UIEventHandler<HTMLUListElement>;
    onOpenPerson: (performer: Performer) => void;
    /** «Написати» з картки активної людини, ще до її профілю. */
    onWrite: (performer: Performer) => void;
    onOpenRequest: (request: MapRequest) => void;
  }
}

const scrollRowIntoStack = (list: HTMLUListElement | null, item: HTMLElement | null) => {
  const first = list?.querySelector("li");
  if (!list || !item || !first) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: item.offsetTop - first.offsetTop, behavior: reduce ? "auto" : "smooth" });
};

export const GroupPreviewPanel = ({ members, requests, listRef, onScroll, onOpenPerson, onWrite, onOpenRequest }: GroupPreviewPanelTypes.Props) => {
  const [activeId, setActiveId] = useState<string | null>(members[0]?.id ?? null);
  const active = members.find((performer) => performer.id === activeId);

  // Активний той, кого сцена позначила data-centered після прокрутки (вона рахує стопку в тому ж onScroll).
  const handleScroll: UIEventHandler<HTMLUListElement> = (event) => {
    onScroll(event);
    const centered = event.currentTarget.querySelector<HTMLElement>('li[data-centered="true"]');
    setActiveId(centered?.dataset.person ?? null);
  };

  return (
    <>
      <p className="group-preview-title">{groupTitle(members.length, requests.length)}</p>
      <ul ref={listRef} className="group-preview-list" style={{ "--rows": members.length + requests.length } as React.CSSProperties} onScroll={handleScroll} aria-label="Виконавці й запити у групі">
        {members.map((performer) => (
          <li key={performer.id} data-person={performer.id}>
            <Button
              variant="bare"
              className="group-preview-row"
              onClick={() => onOpenPerson(performer)}
              onFocus={(event) => scrollRowIntoStack(listRef.current, event.currentTarget.parentElement)}
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
      {active && (
        <div key={active.id} role="group" aria-label={`Коротко про ${active.name}`} className="group-preview-card">
          <PerformerShortCard performer={active} cityName={CITIES.find((city) => city.id === active.cityId)?.name} />
          {!active.mine && (
            <Button variant="secondary" className="w-full" onClick={() => onWrite(active)}>
              Написати
            </Button>
          )}
        </div>
      )}
    </>
  );
};
