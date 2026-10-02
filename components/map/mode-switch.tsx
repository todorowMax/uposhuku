"use client";

import { FileText, Users } from "lucide-react";
import { mapModeStore, mapRequestsStore, setMapMode } from "@/lib/feed/map-requests";
import { useStore } from "@/lib/store";

/**
 * Що показувати на карті: виконавців чи запити замовників. Одночасно не
 * обидва: фото й піни різні, але разом заважають і не дають зрозуміти, на
 * що дивишся. У «Запити» стоїть лічильник того, що є на карті зараз.
 */
export function MapModeSwitch({ variant }: { variant: "float" | "inline" }) {
  const mode = useStore(mapModeStore);
  const { items } = useStore(mapRequestsStore);
  const count = items.filter((item) => item.point).length;
  return (
    <div className={variant === "float" ? "mode-switch mode-float" : "mode-switch mode-inline"} role="tablist" aria-label="Що показувати на карті">
      <button type="button" role="tab" aria-selected={mode === "performers"} onClick={() => setMapMode("performers")}>
        <Users className="size-4" strokeWidth={1.9} />
        Виконавці
      </button>
      <button type="button" role="tab" aria-selected={mode === "requests"} onClick={() => setMapMode("requests")}>
        <FileText className="size-4" strokeWidth={1.9} />
        Запити
        {count > 0 && <span className="mode-count">{count}</span>}
      </button>
    </div>
  );
}
