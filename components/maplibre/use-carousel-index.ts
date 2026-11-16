"use client";

// components/maplibre/use-carousel-index.ts
//
// Яка картка горизонтальної каруселі зараз активна: та, що найближча до центру після прокрутки. Індекс
// рахує чиста функція (lib/maplibre/carousel.ts), тут лише прокрутка, стан і кнопки «назад/вперед».

import { useRef, useState, type UIEventHandler } from "react";
import { activeSlide } from "@/lib/maplibre/carousel";

export const useCarouselIndex = (count: number) => {
  const listRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll: UIEventHandler<HTMLUListElement> = (event) => {
    const list = event.currentTarget;
    const first = list.querySelector("li");
    if (!first) return;
    const step = first.offsetWidth + Number.parseFloat(getComputedStyle(list).columnGap || "0");
    setIndex(activeSlide({ scrollLeft: list.scrollLeft, step, count }));
  };

  /** Прокрутити до картки: кнопки під каруселлю й клавіатура. */
  const goTo = (next: number) => {
    const list = listRef.current;
    const target = list?.querySelectorAll("li")[Math.min(Math.max(next, 0), count - 1)];
    if (!list || !target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: target.offsetLeft - list.offsetLeft - (list.clientWidth - target.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  };

  return { listRef, index, onScroll, goTo };
};
