"use client";

// components/map/chrome-reveal.tsx
//
// Поле запиту, нижні кнопки й кнопка повідомлень сховані CSS, доки карта не
// намальована (html:not([data-chrome-ready]) у globals.css). Коли сцена ставить
// data-map-ready, показуємо їх і виїжджаємо з країв. Якщо карта не завантажилась
// (WebGL недоступний, мережа), через FALLBACK_MS показуємо все одно.

import { useEffect } from "react";
import { gsap } from "gsap";

const FALLBACK_MS = 8000;

const reveal = () => {
  const root = document.documentElement;
  if (root.dataset.chromeReady) return;
  const top = document.querySelector("[data-top-stack]");
  const bottom = document.querySelector(".bottom-controls");
  const side = document.querySelector(".inbox-button");
  root.dataset.chromeReady = "true";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Атрибут щойно ввімкнув елементи, а from() у цьому ж тіку ставить початковий стан: кадру між ними немає.
  const options = { duration: 0.7, ease: "power3.out", clearProps: "transform,opacity,visibility" } as const;
  if (top) gsap.from(top, { y: -36, opacity: 0, ...options });
  if (bottom) gsap.from(bottom, { y: 36, opacity: 0, delay: 0.12, ...options });
  if (side) gsap.from(side, { x: 24, opacity: 0, delay: 0.24, ...options });
};

export function ChromeReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.mapReady) {
      reveal();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!root.dataset.mapReady) return;
      observer.disconnect();
      reveal();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-map-ready"] });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reveal();
    }, FALLBACK_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
