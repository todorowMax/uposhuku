"use client";

// components/maplibre/touch-sheets.tsx
//
// Шторки карти на дотик: карусель коротких карток групи й коротка картка одиночного маркера. Стан і жести
// дає use-touch-sheets.ts; тут лише розмітка. Шторка — спільний примітив (фокус, Escape, свайп вниз).

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PerformerShortCard } from "@/components/maplibre/performer-short-card";
import { useProposeWork } from "@/components/maplibre/use-propose-work";
import type { TouchSheetsTypes } from "@/components/maplibre/use-touch-sheets";
import { useCarouselIndex } from "@/components/maplibre/use-carousel-index";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { MapRequest } from "@/lib/feed/types";
import { CITIES } from "@/lib/map/cities";
import { groupTitle } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";

const cityName = (performer: Performer) => CITIES.find((city) => city.id === performer.cityId)?.name;

const noop = () => undefined;

/** Дії під каруселлю для активної людини: окремий компонент, бо хук пропозиції прив'язаний до виконавця. */
const PersonActions = ({ performer, onClose, onOpenPerson }: { performer: Performer; onClose: () => void; onOpenPerson: (performer: Performer) => void }) => {
  const proposeWork = useProposeWork(performer, onClose, noop);
  return (
    <div className="pin-sheet-actions">
      <Button variant="secondary" onClick={() => onOpenPerson(performer)}>
        Профіль
      </Button>
      {!performer.mine && <Button onClick={proposeWork}>Запропонувати роботу</Button>}
    </div>
  );
};

type Slide = { kind: "person"; performer: Performer } | { kind: "request"; request: MapRequest };

/**
 * Група на телефоні: картки людей горизонтальною каруселлю, як стопка на десктопі. Активна та, на якій зупинився
 * свайп: вона чітка й має дії під каруселлю, сусідня виглядає з краю, тож видно, що є ще. Окремої кнопки «i» немає:
 * коротка картка і є слайд.
 */
const GroupSheet = ({
  group,
  onClose,
  onZoom,
  onOpenPerson,
  onOpenRequest,
}: {
  group: TouchSheetsTypes.Group;
  onClose: () => void;
  onZoom: () => void;
  onOpenPerson: (performer: Performer) => void;
  onOpenRequest: (request: MapRequest) => void;
}) => {
  const slides: Slide[] = [...group.members.map((performer) => ({ kind: "person" as const, performer })), ...group.requests.map((request) => ({ kind: "request" as const, request }))];
  const { listRef, index, onScroll, goTo } = useCarouselIndex(slides.length);
  const active = slides[index];
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <div className="group-sheet-head">
          <SheetTitle className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{groupTitle(group.members.length, group.requests.length)}</SheetTitle>
          <Button variant="secondary" onClick={onZoom}>
            Наблизити
          </Button>
        </div>
        <ul ref={listRef} className="group-carousel" onScroll={onScroll} aria-label="Виконавці й запити у групі">
          {slides.map((slide, slideIndex) => (
            <li key={slide.kind === "person" ? slide.performer.id : slide.request.id} className="group-carousel-slide" data-active={slideIndex === index || undefined} aria-current={slideIndex === index || undefined}>
              {slide.kind === "person" ? (
                <PerformerShortCard performer={slide.performer} cityName={cityName(slide.performer)} />
              ) : (
                <div className="grid gap-1">
                  <p className="text-sm font-semibold text-ink">Ваш запит</p>
                  <p className="line-clamp-3 text-sm text-ink-muted">{slide.request.text}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
        {slides.length > 1 && (
          <div className="group-carousel-nav">
            <Button variant="icon" aria-label="Попередня картка" disabled={index === 0} onClick={() => goTo(index - 1)}>
              <ChevronLeft aria-hidden className="size-5" />
            </Button>
            <p className="text-xs text-ink-muted" aria-live="polite">
              {index + 1} з {slides.length}
            </p>
            <Button variant="icon" aria-label="Наступна картка" disabled={index === slides.length - 1} onClick={() => goTo(index + 1)}>
              <ChevronRight aria-hidden className="size-5" />
            </Button>
          </div>
        )}
        <SheetBody>
          {active?.kind === "person" && <PersonActions key={active.performer.id} performer={active.performer} onClose={onClose} onOpenPerson={onOpenPerson} />}
          {active?.kind === "request" && (
            <div className="pin-sheet-actions">
              <Button onClick={() => onOpenRequest(active.request)}>Відкрити запит</Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

const PinSheet = ({ performer, onClose, onOpenCard }: { performer: Performer; onClose: () => void; onOpenCard: (id: string) => void }) => {
  const proposeWork = useProposeWork(performer, onClose, noop);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <SheetTitle className="sr-only">{`Коротко про ${performer.name}`}</SheetTitle>
        <SheetBody>
          <PerformerShortCard performer={performer} cityName={cityName(performer)} />
          <div className="pin-sheet-actions">
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onOpenCard(performer.id);
              }}
            >
              Профіль
            </Button>
            {!performer.mine && <Button onClick={proposeWork}>Запропонувати роботу</Button>}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

export const TouchSheets = ({
  state,
  onOpenPerson,
  onOpenCard,
  onOpenRequest,
  onClose,
  onZoomGroup,
}: {
  state: TouchSheetsTypes.State;
  onOpenPerson: (performer: Performer) => void;
  onOpenCard: (id: string) => void;
  onOpenRequest: (request: MapRequest) => void;
  onClose: () => void;
  onZoomGroup: (feature: TouchSheetsTypes.Group["feature"]) => void;
}) => {
  if (!state) return null;
  if (state.kind === "pin") return <PinSheet performer={state.performer} onClose={onClose} onOpenCard={onOpenCard} />;
  const { group } = state;
  return (
    <GroupSheet
      group={group}
      onClose={onClose}
      onZoom={() => onZoomGroup(group.feature)}
      onOpenPerson={(performer) => {
        onClose();
        onOpenPerson(performer);
      }}
      onOpenRequest={(request) => {
        onClose();
        onOpenRequest(request);
      }}
    />
  );
};
