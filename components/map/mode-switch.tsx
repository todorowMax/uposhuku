"use client";

import { FileText, Users } from "@/components/icons";
import { allPerformersStore, mapModeStore, mapRequestsStore, setMapMode, showAllPerformers } from "@/lib/feed/map-requests";
import { sessionStore } from "@/lib/auth/client";
import { profileStore } from "@/lib/profile/client";
import { useActiveRequest } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";

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
    <div className="mode-switch mode-dock" role="tablist" aria-label="Що показувати на карті">
      <button type="button" role="tab" aria-selected={mode === "performers" && !allPerformers} aria-label="Виконавці" onClick={() => setMapMode("performers")}>
        <Users className="size-[18px]" />
        <span className="mode-label">Виконавці</span>
      </button>
      {hasOpenRequest && (
        <button type="button" role="tab" aria-selected={mode === "performers" && allPerformers} aria-label="Всі розробники" onClick={showAllPerformers}>
          <Users className="size-[18px]" />
          <span className="mode-label">Всі розробники</span>
        </button>
      )}
      {canSeeRequests && (
        <button type="button" role="tab" aria-selected={mode === "requests"} aria-label={count > 0 ? `Запити: ${count}` : "Запити"} onClick={() => setMapMode("requests")}>
          <FileText className="size-[18px]" />
          <span className="mode-label">Запити</span>
          {count > 0 && <span className="mode-count">{count}</span>}
        </button>
      )}
    </div>
  );
}
