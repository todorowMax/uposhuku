"use client";

import { Button } from "@/components/ui/button";
import { FileText, UserRound, Users } from "@/components/icons";
import { allPerformersStore, mapModeStore, mapRequestsStore, setMapMode, showAllPerformers } from "@/lib/feed/map-requests";
import { sessionStore } from "@/lib/auth/client";
import { profileStore } from "@/lib/profile/client";
import { useActiveRequest } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

/**
 * Що показувати на карті: виконавців із власними запитами чи стрічку запитів.
 * Стоїть унизу по центру, як «Список / Карта» в інших сервісах:
 * це про саму карту, а не про фільтри, і там вільно на будь-якій ширині.
 * На телефоні лише іконки. У «Запити» лічильник того, що є на карті.
 */
export function MapModeSwitch() {
  const session = useStore(sessionStore);
  const profile = useStore(profileStore);
  const mode = useStore(mapModeStore);
  const allPerformers = useStore(allPerformersStore);
  const { items } = useStore(mapRequestsStore);
  const request = useActiveRequest();
  const hasOpenRequest = request?.status === "open";
  const canSeeRequests = session.status === "user" && profile.status === "ready" && Boolean(profile.profile?.published);
  if (!hasOpenRequest && !canSeeRequests) return null;
  const count = items.filter((item) => item.point).length;
  return (
    <div className="mode-switch mode-dock" role="group" aria-label="Що показувати на карті">
      <Button variant="bare" aria-pressed={mode === "performers" && !allPerformers} aria-label="Виконавці" onClick={() => {
          track(EVENTS.mapModeSwitched, { mode: "performers" });
          setMapMode("performers");
        }}>
        <UserRound className="size-[18px]" />
        <span className="mode-label">Виконавці</span>
      </Button>
      {hasOpenRequest && (
        <Button variant="bare" aria-pressed={mode === "performers" && allPerformers} aria-label="Всі виконавці" onClick={() => {
            track(EVENTS.mapModeSwitched, { mode: "all_performers" });
            showAllPerformers();
          }}>
          <Users className="size-[18px]" />
          <span className="mode-label">Всі виконавці</span>
        </Button>
      )}
      {canSeeRequests && (
        <Button variant="bare" aria-pressed={mode === "requests"} aria-label={count > 0 ? `Запити: ${count}` : "Запити"} onClick={() => {
            track(EVENTS.mapModeSwitched, { mode: "requests" });
            setMapMode("requests");
          }}>
          <FileText className="size-[18px]" />
          <span className="mode-label">Запити</span>
          {count > 0 && <span className="mode-count">{count}</span>}
        </Button>
      )}
    </div>
  );
}
