"use client";

// components/maplibre/touch-sheets.tsx
//
// Шторки карти на дотик: список людей групи й коротка картка одиночного маркера. Стан і жести
// дає use-touch-sheets.ts; тут лише розмітка. Шторка — спільний примітив (фокус, Escape, свайп вниз).

import { useState } from "react";
import { Info } from "lucide-react";
import { PerformerShortCard } from "@/components/maplibre/performer-short-card";
import { useProposeWork } from "@/components/maplibre/use-propose-work";
import type { TouchSheetsTypes } from "@/components/maplibre/use-touch-sheets";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { MapRequest } from "@/lib/feed/types";
import { CITIES } from "@/lib/map/cities";
import { avatarBackground } from "@/lib/map/avatar-style";
import { groupTitle, rowLine } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";

const cityName = (performer: Performer) => CITIES.find((city) => city.id === performer.cityId)?.name;

const noop = () => undefined;

const PersonRow = ({ performer, onOpen }: { performer: Performer; onOpen: (performer: Performer) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const cardId = `short-card-${performer.id}`;
  return (
    <li className="group-sheet-item">
      <div className="group-sheet-row">
        <Button variant="bare" onClick={() => onOpen(performer)} className="group-sheet-main">
          <span aria-hidden className="group-sheet-avatar" style={avatarBackground(performer)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{performer.name}</span>
            <span className="block truncate text-xs text-ink-muted">{performer.specialty}</span>
            <span className="block truncate text-xs text-ink-muted">{rowLine(performer.stats)}</span>
          </span>
        </Button>
        <Button
          variant="icon"
          aria-label={`Коротко про ${performer.name}`}
          aria-expanded={expanded}
          aria-controls={cardId}
          onClick={() => setExpanded((value) => !value)}
          className="group-sheet-info"
          data-expanded={expanded || undefined}
        >
          <Info aria-hidden className="size-5" strokeWidth={1.8} />
        </Button>
      </div>
      {expanded && <PerformerShortCard id={cardId} performer={performer} cityName={cityName(performer)} className="group-sheet-card" />}
    </li>
  );
};

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
}) => (
  <Sheet open onOpenChange={(open) => !open && onClose()}>
    <SheetContent size="tall" aria-describedby={undefined}>
      <div className="group-sheet-head">
        <SheetTitle className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{groupTitle(group.members.length, group.requests.length)}</SheetTitle>
        <Button variant="secondary" onClick={onZoom}>
          Наблизити
        </Button>
      </div>
      <SheetBody>
        <ul className="group-sheet-list" aria-label="Виконавці й запити у групі">
          {group.members.map((performer) => (
            <PersonRow key={performer.id} performer={performer} onOpen={onOpenPerson} />
          ))}
          {group.requests.map((request) => (
            <li key={request.id} className="group-sheet-item">
              <Button variant="bare" onClick={() => onOpenRequest(request)} className="group-sheet-main">
                <span aria-hidden className="group-sheet-request">$</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">Ваш запит</span>
                  <span className="block truncate text-xs text-ink-muted">{request.text}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </SheetBody>
    </SheetContent>
  </Sheet>
);

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
