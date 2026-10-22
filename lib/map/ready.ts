// lib/map/ready.ts
//
// Сигнал «карта намальована» для серверної заставки (components/map-skeleton).
// Заставка — чистий HTML і CSS, React-стану в неї немає, тож сцена ставить
// атрибут на <html>, а CSS ховає заставку.

import { EVENTS, track } from "@/lib/telemetry/track";

let reported = false;

export const setMapReady = (ready: boolean) => {
  if (typeof document === "undefined") return;
  if (ready) {
    document.documentElement.dataset.mapReady = "true";
    // Скільки чекали першого кадру карти: один раз за завантаження сторінки.
    if (!reported) {
      reported = true;
      track(EVENTS.mapReady, { ms: Math.round(performance.now()) });
    }
  }
  else delete document.documentElement.dataset.mapReady;
};
