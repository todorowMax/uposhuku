"use client";

// components/composer/use-tag-row-fit.ts
//
// Скільки чипів тегів влазить в один рядок. Міряємо на невидимій копії рядка: ширина чипа залежить від назви, і
// вгадувати її з кількості літер ненадійно. Перенесено з компонента без змін поведінки.

import { useLayoutEffect, useRef, useState } from "react";

const GAP = 6;

export const useTagRowFit = (count: number, signature: string) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(count);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const recount = () => {
      const available = row.clientWidth;
      const chips = [...measure.querySelectorAll<HTMLElement>("[data-measure-chip]")];
      const more = measure.querySelector<HTMLElement>("[data-measure-more]")?.offsetWidth ?? 0;
      const total = chips.reduce((sum, chip, index) => sum + chip.offsetWidth + (index ? GAP : 0), 0);
      if (total <= available) {
        setFit(chips.length);
        return;
      }
      let used = 0;
      let fitted = 0;
      for (const chip of chips) {
        const next = used + (fitted ? GAP : 0) + chip.offsetWidth;
        if (next + GAP + more > available) break;
        used = next;
        fitted++;
      }
      setFit(fitted);
    };
    recount();
    const observer = new ResizeObserver(recount);
    observer.observe(row);
    return () => observer.disconnect();
  }, [signature]);

  return { rowRef, measureRef, fit };
};
