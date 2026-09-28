"use client";

import { Minus, Plus } from "lucide-react";

interface GlobeZoomControlProps {
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
export function GlobeZoomControl({ value, onChange, onStep }: GlobeZoomControlProps) {
  return (
    <div className="absolute right-4 bottom-4 z-[var(--z-controls)] flex items-stretch gap-3 sm:right-6 sm:bottom-6">
      <label className="flex h-12 items-center gap-3 rounded-2xl bg-surface px-4 text-sm text-ink shadow-[0_8px_28px_-12px_rgb(15_23_40/0.35)] ring-1 ring-line">
        <span>Україна</span>
        <input
          type="range"
          min={0}
          max={STEPS}
          value={Math.round(value * STEPS)}
          onChange={(event) => onChange(Number(event.target.value) / STEPS)}
          aria-label="Масштаб карти від країни до міста"
          className="globe-zoom-range w-24 sm:w-28"
        />
        <span>Місто</span>
      </label>
      <div className="flex h-12 items-center rounded-2xl bg-surface shadow-[0_8px_28px_-12px_rgb(15_23_40/0.35)] ring-1 ring-line">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={value <= 0}
          aria-label="Віддалити"
          className="grid h-full w-12 place-items-center rounded-l-2xl text-ink transition-colors hover:bg-bg disabled:text-ink-muted/50"
        >
          <Minus className="size-4" strokeWidth={2.25} />
        </button>
        <span aria-hidden className="h-5 w-px bg-line" />
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={value >= 1}
          aria-label="Наблизити"
          className="grid h-full w-12 place-items-center rounded-r-2xl text-ink transition-colors hover:bg-bg disabled:text-ink-muted/50"
        >
          <Plus className="size-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
