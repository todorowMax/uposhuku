"use client";

import { FileText, Users } from "lucide-react";
import { mapModeStore, mapRequestsStore, setMapMode } from "@/lib/feed/map-requests";
import { useStore } from "@/lib/store";

/**
 * Що показувати на карті: виконавців чи запити замовників. Одночасно не
 * обидва: фото й піни різні, але разом заважають і не дають зрозуміти, на
 * що дивишся. Стоїть унизу по центру, як «Список / Карта» в інших сервісах:
 * це про саму карту, а не про фільтри, і там вільно на будь-якій ширині.
 * На телефоні лише іконки. У «Запити» лічильник того, що є на карті.
 */
export function MapModeSwitch() {
  const mode = useStore(mapModeStore);
  const { items } = useStore(mapRequestsStore);
  const count = items.filter((item) => item.point).length;
  return (
    <div className="mode-switch mode-dock" role="tablist" aria-label="Що показувати на карті">
      <button type="button" role="tab" aria-selected={mode === "performers"} aria-label="Виконавці" onClick={() => setMapMode("performers")}>
        <Users className="size-[18px]" strokeWidth={1.9} />
        <span className="mode-label">Виконавці</span>
      </button>
      <button type="button" role="tab" aria-selected={mode === "requests"} aria-label={count > 0 ? `Запити: ${count}` : "Запити"} onClick={() => setMapMode("requests")}>
        <FileText className="size-[18px]" strokeWidth={1.9} />
        <span className="mode-label">Запити</span>
        {count > 0 && <span className="mode-count">{count}</span>}
      </button>
    </div>
  );
}
