// lib/map/palette.ts
//
// Приглушена сіро-блакитна палітра референсу. MapLibre не читає CSS-змінних,
// тому кольори карти й елементів інтерфейсу задані окремо.

export const MAP_PALETTE = {
  /** Тло сторінки, на ньому ж тане горизонт. */
  sky: "#b9c0ca",
  /** Серпанок над далекою поверхнею, трохи темніший за тло. */
  haze: "#d5dce4",

  /** Суходіл поза Україною: світлий холодний сірий. */
  land: "#e2e9e5",
  /** Тіні рельєфу на суходолі. */
  landShadow: "#c3cec8",
  /** Кордони між іншими країнами. */
  border: "#bec9c7",

  /** Мілина: шельф, Азовське море, озера. */
  waterShallow: "#a2c6c7",
  /** Глибина: центр Чорного моря. */
  waterDeep: "#6fabb2",
  /** Річки. */
  river: "#a7c5c2",

  /** Верх «плато» України. */
  ukraineCap: "#efbd98",
  /** Стінки плато. */
  ukraineSide: "#c28f6d",
  /** Контур України. */
  ukraineStroke: "#b98362",

  /** Запити: крапки. */
  request: "#91a99d",
} as const;

/** `#rrggbb` → [r, g, b] у 0..255. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
