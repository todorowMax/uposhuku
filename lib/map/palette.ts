// lib/map/palette.ts
//
// Deep / Ocean / Tide / Wave / Foam з помаранчевим акцентом. MapLibre не читає CSS-змінних,
// тому кольори карти й елементів інтерфейсу задані окремо.

export const MAP_PALETTE = {
  /** Темне небо за глобусом. */
  sky: "#03090d",
  /** Океанський серпанок уздовж горизонту. */
  haze: "#00364a",

  /** Суходіл поза Україною: світлий холодний сірий. */
  land: "#dce7e4",
  /** Тіні рельєфу на суходолі. */
  landShadow: "#a7bcc0",
  /** Кордони між іншими країнами. */
  border: "#8caeb4",

  /** Мілина: шельф, Азовське море, озера. */
  waterShallow: "#6ba0b2",
  /** Глибина: центр Чорного моря. */
  waterDeep: "#427484",
  /** Річки. */
  river: "#6ba0b2",

  /** Верх «плато» України. */
  ukraineCap: "#f6b08c",
  /** Стінки плато. */
  ukraineSide: "#ce6d45",
  /** Контур України. */
  ukraineStroke: "#f2693c",

  /** Запити: крапки. */
  request: "#6ba0b2",
} as const;

/** `#rrggbb` → [r, g, b] у 0..255. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
