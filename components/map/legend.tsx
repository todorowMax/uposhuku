"use client";

import { useEffect, useRef, useState } from "react";
import { Info, X } from "@/components/icons";
import { DocLinks } from "@/components/legal/doc-links";
import { allPerformersStore, mapModeStore } from "@/lib/feed/map-requests";
import { TIER_PX } from "@/lib/placement/tiers";
import { useStore } from "@/lib/store";

/**
 * Про сервіс: коротке пояснення та позначки карти на вимогу.
 */
export function LegendButton() {
  const [open, setOpen] = useState(false);
  const mode = useStore(mapModeStore);
  const allPerformers = useStore(allPerformersStore);
  const rootRef = useRef<HTMLDivElement>(null);

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
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Про сервіс" className="legend-button">
        <Info className="size-[18px]" />
        <span>Про сервіс</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Про сервіс" className="legend-panel glass-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Про Vibe Map</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрити інформацію про сервіс" className="auth-icon-button -mr-1.5">
              <X className="size-4" />
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-muted">Опишіть задачу й знайдіть виконавця на мапі України. Виконавці з профілем можуть переглядати запити після входу.</p>
          <h3 className="text-[12px] font-semibold text-ink">Позначки на мапі</h3>
          {mode === "requests" ? (
            <ul className="legend-list">
              <li>
                <span className="legend-icon legend-icon-wide">
                  <span className="legend-pin" data-variant="plain">до 15 тис ₴</span>
                </span>
                <span>
                  <b>Бульбашка із сумою: запит замовника.</b> Клік відкриває запит і форму відгуку. На карті видно лише місто, без адреси.
                </span>
              </li>
              <li>
                <span className="legend-icon legend-icon-wide legend-pins">
                  <span className="legend-pin legend-pin-sm" data-variant="match" aria-hidden />
                  <span className="legend-pin legend-pin-sm" data-variant="own" aria-hidden />
                  <span className="legend-pin legend-pin-sm" data-variant="sent" aria-hidden />
                </span>
                <span>
                  <b>Колір показує стан.</b> Золотий: під ваші теги. Темний: ваш запит. Зелений: ви вже відгукнулись.
                </span>
              </li>
              <li>
                <span className="legend-icon">
                  <span className="legend-group legend-group-req">5</span>
                </span>
                <span>
                  <b>Число: кілька запитів поруч.</b> Клік наближає карту, і запити розходяться.
                </span>
              </li>
            </ul>
          ) : (
            <ul className="legend-list">
              <li>
                <span className="legend-icon">
                  <span className="legend-photo" />
                </span>
                <span>
                  <b>Фото: виконавець.</b> Клік відкриває картку, наведення збільшує фото.
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
              {!allPerformers && <li>
                <span className="legend-icon legend-icon-wide">
                  <span className="legend-pin" data-variant="own">$$</span>
                </span>
                <span><b>Пін із доларами: ваш відкритий запит.</b> Наведіть, щоб побачити бюджет, або натисніть, щоб відкрити запит.</span>
              </li>}
              <li>
                <span className="legend-icon">
                  <span className="legend-group">12</span>
                </span>
                <span>
                  <b>Група поруч.</b> {allPerformers ? "У ній кілька виконавців." : "У ній можуть бути виконавці та ваші запити."} Наведіть курсор, щоб побачити список; клік наближає карту.
                </span>
              </li>
            </ul>
          )}
          {mode === "requests" && <p className="legend-switch-note">Перемикач унизу показує виконавців або запити.</p>}
          <DocLinks />
        </div>
      )}
    </div>
  );
}
