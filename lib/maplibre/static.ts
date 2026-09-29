// lib/maplibre/static.ts
//
// Межі статичних картинок першого кадру MapLibre (public/map). Спільні для
// скрипта, який їх перепроєктовує, і стилю, який їх кладе: розійдуться
// числа, і картинка з'їде відносно контуру України.

import { REGION } from "../map/region";

export const STATIC_MAP = {
  /** Уся Земля в межах, які вміщає Web Mercator. */
  world: { lngMin: -180, lngMax: 180, latMin: -84, latMax: 84 },
  /** Детальна латка навколо України, з детальнішим рельєфом. */
  region: { lngMin: REGION.lngMin, lngMax: REGION.lngMax, latMin: REGION.latMin, latMax: REGION.latMax },
} as const;

/**
 * Масштаб, з якого вмикаються дані OpenStreetMap. До нього карта
 * складається лише зі статичних картинок і власних шарів, без мережі.
 */
export const DETAIL_ZOOM = 6.5;

type Bounds = { lngMin: number; lngMax: number; latMin: number; latMax: number };

/** Кути картинки для image-джерела MapLibre: ліво-верх, право-верх, право-низ, ліво-низ. */
export const corners = (b: Bounds): [[number, number], [number, number], [number, number], [number, number]] => [
  [b.lngMin, b.latMax],
  [b.lngMax, b.latMax],
  [b.lngMax, b.latMin],
  [b.lngMin, b.latMin],
];
