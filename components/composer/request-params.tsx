"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, MapPin, Wallet, X } from "@/components/icons";
import { CITIES } from "@/lib/map/cities";
import { DEADLINES, type Deadline } from "@/lib/requests/types";

export interface RequestParamsValue {
  budget: number | null;
  deadline: Deadline | null;
  cityId: string | null;
  /** «Віддалено» обрано явно: відрізняємо від «не вказано». */
  remote: boolean;
}

export const EMPTY_PARAMS: RequestParamsValue = { budget: null, deadline: null, cityId: null, remote: false };

const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "uk"));
const PRICE = new Intl.NumberFormat("uk-UA");
const BUDGET_PRESETS = [3000, 10000, 25000, 50000] as const;

type Open = "budget" | "deadline" | "city" | null;

/**
 * Умови запиту чипами поруч із кнопкою «Знайти»: бюджет, термін, де.
 * Необов'язкові: людина може нічого не вказувати. Кожен чип відкриває
 * маленьку панельку з готовими варіантами, щоб не набирати руками.
 */
export function RequestParams({ value, onChange }: { value: RequestParamsValue; onChange: (value: RequestParamsValue) => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [budgetText, setBudgetText] = useState(value.budget ? String(value.budget) : "");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const place = value.remote ? "Віддалено" : value.cityId ? CITIES.find((city) => city.id === value.cityId)?.name : null;
  const set = (patch: Partial<RequestParamsValue>) => onChange({ ...value, ...patch });
  const toggle = (kind: Exclude<Open, null>) => setOpen((current) => (current === kind ? null : kind));

  const chip = (kind: Exclude<Open, null>, icon: React.ReactNode, label: string, filled: string | null | undefined, clear: () => void) => (
    <span className="param-chip" data-filled={Boolean(filled) || undefined} data-open={open === kind || undefined}>
      <button type="button" onClick={() => toggle(kind)} aria-expanded={open === kind} aria-haspopup="dialog" className="param-chip-main">
        {icon}
        <span className="param-chip-label">{filled ?? label}</span>
      </button>
      {filled && (
        <button type="button" onClick={clear} aria-label={`Прибрати: ${label}`} className="param-chip-clear">
          <X className="size-3" />
        </button>
      )}
    </span>
  );

  return (
    <div ref={rootRef} className="composer-params" role="group" aria-label="Умови запиту">
      {chip("budget", <Wallet className="size-3.5 shrink-0" />, "Бюджет", value.budget ? `до ${PRICE.format(value.budget)} ₴` : null, () => {
        set({ budget: null });
        setBudgetText("");
      })}
      {chip("deadline", <CalendarClock className="size-3.5 shrink-0" />, "Термін", value.deadline ? DEADLINES[value.deadline] : null, () => set({ deadline: null }))}
      {chip("city", <MapPin className="size-3.5 shrink-0" />, "Де", place, () => set({ cityId: null, remote: false }))}

      {open === "budget" && (
        <div className="param-pop" role="dialog" aria-label="Бюджет">
          <p className="param-pop-title">Скільки готові витратити, максимум</p>
          <div className="param-presets">
            {BUDGET_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="param-option"
                data-on={value.budget === preset || undefined}
                onClick={() => {
                  set({ budget: preset });
                  setBudgetText(String(preset));
                  setOpen(null);
                }}
              >
                до {PRICE.format(preset)} ₴
              </button>
            ))}
          </div>
          <label htmlFor="param-budget" className="sr-only">
            Своя сума, гривні
          </label>
          <div className="param-custom-amount mt-2">
            <input
              id="param-budget"
              inputMode="numeric"
              value={budgetText}
              onChange={(event) => setBudgetText(event.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const amount = Number(budgetText);
                  set({ budget: amount >= 100 ? amount : null });
                  setOpen(null);
                }
              }}
              placeholder="Своя сума, ₴"
              className="auth-input min-h-[38px] min-w-0 flex-1 px-3 text-[13px] tabular-nums"
            />
            <button
              type="button"
              className="offer-primary"
              onClick={() => {
                const amount = Number(budgetText);
                set({ budget: amount >= 100 ? amount : null });
                setOpen(null);
              }}
            >
              Готово
            </button>
          </div>
          <p className="param-pop-hint">Не знаєте? Не вказуйте: виконавці самі запропонують ціну.</p>
        </div>
      )}

      {open === "deadline" && (
        <div className="param-pop" role="dialog" aria-label="Термін">
          <p className="param-pop-title">Коли потрібен результат</p>
          <div className="grid gap-1">
            {(Object.keys(DEADLINES) as Deadline[]).map((key) => (
              <button
                key={key}
                type="button"
                className="param-row"
                data-on={value.deadline === key || undefined}
                onClick={() => {
                  set({ deadline: value.deadline === key ? null : key });
                  setOpen(null);
                }}
              >
                {DEADLINES[key]}
              </button>
            ))}
          </div>
        </div>
      )}

      {open === "city" && (
        <div className="param-pop" role="dialog" aria-label="Де">
          <p className="param-pop-title">Де потрібен виконавець</p>
          <button
            type="button"
            className="param-row"
            data-on={value.remote || undefined}
            onClick={() => {
              set({ remote: true, cityId: null });
              setOpen(null);
            }}
          >
            Віддалено, місто не важливе
          </button>
          <label htmlFor="param-city" className="pe-label mt-2">
            Або місто
          </label>
          <select
            id="param-city"
            value={value.cityId ?? ""}
            onChange={(event) => {
              set({ cityId: event.target.value || null, remote: false });
              if (event.target.value) setOpen(null);
            }}
            className="auth-input min-h-[38px] w-full text-[13px]"
            data-empty={!value.cityId || undefined}
          >
            <option value="">Оберіть місто</option>
            {CITY_OPTIONS.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
