// lib/map/ready.ts
//
// Сигнал «карта намальована» для серверної заставки (components/map-skeleton).
// Заставка — чистий HTML і CSS, React-стану в неї немає, тож сцена ставить
// атрибут на <html>, а CSS ховає заставку.

export const setMapReady = (ready: boolean) => {
  if (typeof document === "undefined") return;
  if (ready) document.documentElement.dataset.mapReady = "true";
  else delete document.documentElement.dataset.mapReady;
};
