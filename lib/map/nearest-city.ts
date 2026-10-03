// lib/map/nearest-city.ts

import { CITIES } from "./cities";
import type { City, GeoPoint } from "./types";

const RADIUS_KM = 6371;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Відстань між двома точками, км (гаверсинус). */
export const distanceKm = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.sqrt(h));
};

export const nearestCity = (point: GeoPoint): { city: City; km: number } => {
  let best = { city: CITIES[0], km: Infinity };
  for (const city of CITIES) {
    const km = distanceKm(point, city);
    if (km < best.km) best = { city, km };
  }
  return best;
};

/** Далі за цю відстань від міста з вибору точка вже «в іншому місті». */
export const SAME_CITY_KM = 80;
