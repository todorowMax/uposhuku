"use client";

import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { TIER_PX } from "@/lib/placement/tiers";

const KEY = "vm:legend-seen";
let decided = false;
let openFirst = false;

/**
 * Легенда карти: що означають фото, групи, розмір і крапки. Відкрита, коли
 * людина вперше на сайті, далі згортається в кнопку «i» і не заважає.
 */
export function LegendButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Кнопка перемонтовується, коли акаунт переходить зі «завантаження» у «гість» чи «увійшов»:
  // рішення «показати відкритою» приймаємо один раз за відкриття сторінки.
  useEffect(() => {
    if (!decided) {
      decided = true;
      try {
        openFirst = !window.localStorage.getItem(KEY);
        if (openFirst) window.localStorage.setItem(KEY, "1");
      } catch {
        openFirst = false;
      }
    }
    if (openFirst) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="legend">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Легенда карти" className="legend-button">
        <Info className="size-[18px]" strokeWidth={1.9} />
        <span className="hidden sm:inline">Легенда</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Легенда карти" className="legend-panel glass-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Що на карті</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрити легенду" className="auth-icon-button -mr-1.5">
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
          <ul className="legend-list">
            <li>
              <span className="legend-icon">
                <span className="legend-photo" />
              </span>
              <span>
                <b>Фото — виконавець.</b> Клік відкриває картку, наведення збільшує.
              </span>
            </li>
            <li>
              <span className="legend-icon legend-sizes" aria-hidden>
                {[0, 2, 5].map((tier) => (
                  <span key={tier} className="legend-photo" style={{ width: TIER_PX[tier] * 0.6, height: TIER_PX[tier] * 0.6 }} />
                ))}
              </span>
              <span>
                <b>Чим більше фото, тим вище розміщення.</b> Платні виконавці з позначкою «Просування» вищі й у списку пропозицій.
              </span>
            </li>
            <li>
              <span className="legend-icon">
                <span className="legend-group">12</span>
              </span>
              <span>
                <b>Число — група людей поруч.</b> Наведіть, щоб побачити список, клік наближає.
              </span>
            </li>
            <li>
              <span className="legend-icon">
                <span className="legend-dot" />
              </span>
              <span>
                <b>Крапка — запит замовника.</b> Показуємо лише місто, без адреси.
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
