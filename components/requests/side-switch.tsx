"use client";

import { sidePanelChoice, useSidePanel } from "@/lib/requests/side-panel";

/** Перемикач правої колонки для тих, хто і замовник, і виконавець. */
export function SidePanelSwitch({ offers, feed }: { offers: number; feed: number }) {
  const { kind, canSwitch } = useSidePanel();
  if (!canSwitch) return null;
  return (
    <div className="side-switch" role="tablist" aria-label="Права панель">
      <button type="button" role="tab" aria-selected={kind === "offers"} onClick={() => sidePanelChoice.set("offers")}>
        Пропозиції{offers > 0 && <span className="side-switch-count">{offers}</span>}
      </button>
      <button type="button" role="tab" aria-selected={kind === "feed"} onClick={() => sidePanelChoice.set("feed")}>
        Запити{feed > 0 && <span className="side-switch-count">{feed}</span>}
      </button>
    </div>
  );
}
