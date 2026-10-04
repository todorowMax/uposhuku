"use client";

import { forwardRef } from "react";
import { X } from "@/components/icons";
import { FeedCard, type RespondGate } from "@/components/requests/feed-panel";
import { authFlowStore, sessionStore } from "@/lib/auth/client";
import { mapRequestsStore, mapSelectedRequest, patchMapRequest, setMapMode } from "@/lib/feed/map-requests";
import type { MapRequest } from "@/lib/feed/types";
import { profileEditorStore } from "@/lib/profile/client";
import { activeRequestStore, composingStore } from "@/lib/auth/client";
import { offersCollapsedStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";

const close = () => mapSelectedRequest.set(null);

/**
 * Запит на карті по кліку на маркер: той самий опис і та сама форма
 * відгуку, що в стрічці виконавця. Виконавець відгукується прямо тут;
 * гість і людина без профілю бачать, що треба зробити; свій запит веде до
 * пропозицій на нього.
 */
export const RequestMapCard = forwardRef<HTMLElement, { item: MapRequest }>(function RequestMapCard({ item }, ref) {
  const session = useStore(sessionStore);
  const { performer } = useStore(mapRequestsStore);

  let gate: RespondGate | undefined;
  if (item.own) {
    gate = {
      label: "Відкрити пропозиції",
      note: "Це ваш запит. Відгуки виконавців приходять у правій колонці.",
      onClick: () => {
        close();
        activeRequestStore.set(item.id);
        composingStore.set(false);
        setMapMode("performers");
        offersCollapsedStore.set(false);
      },
    };
  } else if (!performer) {
    gate =
      session.status === "user"
        ? {
            label: "Створити профіль виконавця",
            note: "Щоб відгукнутися, потрібен профіль: фото, спеціальність і кілька тегів. Це кілька хвилин.",
            onClick: () => {
              close();
              profileEditorStore.set(true);
            },
          }
        : {
            label: "Увійти й відгукнутися",
            note: "Пошта й код з листа, без пароля. Потім створите профіль виконавця.",
            onClick: () => {
              close();
              authFlowStore.set({ mode: "performer" });
            },
          };
  }

  return (
    <aside ref={ref} key={item.id} className="performer-card request-map-card glass-panel absolute inset-x-3 bottom-20 z-[var(--z-controls)] rounded-[22px] p-5 shadow-[0_18px_55px_rgba(45,60,67,.16)] max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain sm:inset-x-auto sm:bottom-auto sm:max-h-[calc(100%-120px)] sm:w-[360px]" aria-label="Запит замовника">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-ink-muted">{item.own ? "Ваш запит" : "Запит замовника"}</p>
        <button type="button" onClick={close} aria-label="Закрити картку" className="grid size-7 shrink-0 place-items-center rounded-full bg-white/65 text-ink-muted transition-colors hover:bg-white hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      <FeedCard bare item={item} gate={gate} onChange={(change) => patchMapRequest(item.id, change)} />
    </aside>
  );
});
