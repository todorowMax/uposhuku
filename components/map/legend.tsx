"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  /** На телефоні панель виносимо з кнопки на весь екран: від кнопки вона виїжджала за край. */
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const trigger = (
    <Button variant="bare" aria-label="Про сервіс" className="legend-button">
      <Info className="size-4.5" />
      <span>Про сервіс</span>
    </Button>
  );
  const close = (
    <Button variant="icon" onClick={() => setOpen(false)} aria-label="Закрити інформацію про сервіс" className="-mr-1.5">
      <X className="size-4" />
    </Button>
  );

  // Телефон: шторка знизу, бо від кнопки панель виїжджала за край. Далі: випадайка над кнопкою.
  return (
    <div className="legend">
      {phone ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent aria-describedby={undefined} className="legend-sheet">
            <LegendBody mode={mode} allPerformers={allPerformers} title={<SheetTitle data-size="sm" className="ui-dialog-title">Про Findlyfy</SheetTitle>} close={<SheetClose asChild>{close}</SheetClose>} />
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent side="top" align="center" sideOffset={10} aria-label="Про сервіс" className="legend-panel glass-panel">
            <LegendBody mode={mode} allPerformers={allPerformers} title={<h2 data-size="sm" className="ui-dialog-title">Про Findlyfy</h2>} close={close} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

const LegendBody = ({ mode, allPerformers, title, close }: { mode: string; allPerformers: boolean; title: ReactNode; close: ReactNode }) => (
  <div className="legend-body">
    <div className="flex items-center justify-between">
      {title}
      {close}
    </div>
      <p className="legend-lead">
        Опишіть задачу й знайдіть виконавця на карті України. Виконавці з
        профілем можуть переглядати запити після входу.
      </p>
      <h3 className="legend-heading">
        Позначки на карті
      </h3>
      {mode === "requests" ? (
        <ul className="legend-list">
          <li>
            <span className="legend-icon legend-icon-wide">
              <span className="legend-pin" data-variant="plain">
                до 15 тис ₴
              </span>
            </span>
            <span>
              <b>Бульбашка із сумою: запит замовника.</b> Клік відкриває
              запит і форму відгуку. На карті видно лише місто, без
              адреси.
            </span>
          </li>
          <li>
            <span className="legend-icon legend-icon-wide legend-pins">
              <span
                className="legend-pin legend-pin-sm"
                data-variant="match"
                aria-hidden
              />
              <span
                className="legend-pin legend-pin-sm"
                data-variant="own"
                aria-hidden
              />
              <span
                className="legend-pin legend-pin-sm"
                data-variant="sent"
                aria-hidden
              />
            </span>
            <span>
              <b>Колір показує стан.</b> Золотий: під ваші теги. Темний:
              ваш запит. Зелений: ви вже відгукнулись.
            </span>
          </li>
          <li>
            <span className="legend-icon">
              <span className="legend-group legend-group-req">5</span>
            </span>
            <span>
              <b>Число: кілька запитів поруч.</b> Клік наближає карту, і
              запити розходяться.
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
              <b>Фото: виконавець.</b> Клік відкриває картку, наведення
              збільшує фото.
            </span>
          </li>
          <li>
            <span className="legend-icon legend-sizes" aria-hidden>
              {[0, 2, 5].map((tier) => (
                <span
                  key={tier}
                  className="legend-photo"
                  style={{
                    width: TIER_PX[tier] * 0.6,
                    height: TIER_PX[tier] * 0.6,
                  }}
                />
              ))}
            </span>
            <span>
              <b>Чим більше фото, тим вище розміщення.</b> Платні
              виконавці з позначкою «Просування» вищі й у списку
              пропозицій.
            </span>
          </li>
          {!allPerformers && (
            <li>
              <span className="legend-icon legend-icon-wide">
                <span className="legend-pin" data-variant="own">
                  $$
                </span>
              </span>
              <span>
                <b>Пін із доларами: ваш відкритий запит.</b> Наведіть,
                щоб побачити бюджет, або натисніть, щоб відкрити запит.
              </span>
            </li>
          )}
          <li>
            <span className="legend-icon">
              <span className="legend-group">12</span>
            </span>
            <span>
              <b>Група поруч.</b>{" "}
              {allPerformers
                ? "У ній кілька виконавців."
                : "У ній можуть бути виконавці та ваші запити."}{" "}
              Наведіть курсор, щоб побачити список; клік наближає карту.
            </span>
          </li>
        </ul>
      )}
      {mode === "requests" && (
        <p className="legend-switch-note">
          Перемикач унизу показує виконавців або запити.
        </p>
      )}
      <DocLinks />
  </div>
);
