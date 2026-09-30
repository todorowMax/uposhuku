"use client";

import { Minus, Plus } from "lucide-react";

interface MapZoomControlProps {
  /** 0: вся Україна, 1: місто. */
  value: number;
  onChange: (value: number) => void;
  onStep: (direction: 1 | -1) => void;
}

const STEPS = 1000;

/**
 * Масштаб карти, як на макеті: повзунок «Україна — Місто» і окремо −/+.
 * Повзунок нативний: клавіатура, скрінрідери й дотик працюють без
 * додаткового коду.
 */
export function MapZoomControl({ value, onChange, onStep }: MapZoomControlProps) {
  return (
    <div className="absolute right-4 bottom-4 z-[var(--z-controls)] flex items-stretch gap-3 sm:right-6 sm:bottom-6">
      {/* На телефоні лише −/+: там зумлять двома пальцями, а повзунок забирав півряду. */}
      <label className="glass-panel hidden h-12 items-center gap-3 rounded-2xl px-4 text-sm text-ink sm:flex">
        <span>Україна</span>
        <input
          type="range"
          min={0}
          max={STEPS}
          value={Math.round(value * STEPS)}
          onChange={(event) => onChange(Number(event.target.value) / STEPS)}
          aria-label="Масштаб карти від країни до міста"
          className="map-zoom-range w-28"
        />
        <span>Місто</span>
      </label>
      <div className="glass-panel flex h-12 items-center rounded-2xl">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={value <= 0}
          aria-label="Віддалити"
          className="grid h-full w-12 place-items-center rounded-l-2xl text-ink transition-colors hover:bg-white/65 disabled:text-ink-muted/50"
        >
          <Minus className="size-4" strokeWidth={2.25} />
        </button>
        <span aria-hidden className="h-5 w-px bg-line" />
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={value >= 1}
          aria-label="Наблизити"
          className="grid h-full w-12 place-items-center rounded-r-2xl text-ink transition-colors hover:bg-white/65 disabled:text-ink-muted/50"
        >
          <Plus className="size-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
