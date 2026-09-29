// lib/map/palette.ts
//
// Кольори карти в sRGB. Стиль MapLibre і canvas у скрипті текстур не
// читають CSS-змінні, тому тут окрема копія. Значення зняті піпеткою з макета і
// збігаються з токенами в app/globals.css, див. DESIGN.md.

export const MAP_PALETTE = {
  /** Тло сторінки, на ньому ж тане горизонт. */
  sky: "#f4f6fa",
  /** Серпанок над далекою поверхнею, трохи темніший за тло. */
  haze: "#e9edf3",

  /** Суходіл поза Україною: світлий холодний сірий. */
  land: "#eef0f4",
  /** Тіні рельєфу на суходолі. */
  landShadow: "#c9ced8",
  /** Кордони між іншими країнами. */
  border: "#c3c9d4",

  /** Мілина: шельф, Азовське море, озера. */
  waterShallow: "#78a8de",
  /** Глибина: центр Чорного моря. */
  waterDeep: "#4f86cf",
  /** Річки. */
  river: "#9db4e4",

  /** Верх «плато» України. */
  ukraineCap: "#eaf0f9",
  /** Стінки плато. */
  ukraineSide: "#7c96c8",
  /** Контур України. */
  ukraineStroke: "#5c7cc4",

  /** Запити: крапки. */
  request: "#2a60df",
} as const;

/** `#rrggbb` → [r, g, b] у 0..255. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
