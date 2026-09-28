// lib/map/scatter.ts
import type { GeoPoint } from "./types";

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_EQUATOR = 111.32;
/** Золотий кут: сусідні точки спіралі ніколи не стають одна за одною. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Зсув від точки на кілометри на схід і північ. */
export const offsetKm = (origin: GeoPoint, eastKm: number, northKm: number): GeoPoint => ({
  lat: origin.lat + northKm / KM_PER_DEG_LAT,
  lng: origin.lng + eastKm / (KM_PER_DEG_LNG_EQUATOR * Math.cos((origin.lat * Math.PI) / 180)),
});

/** Скільки витків спіралі пробуємо, поки не знайдемо досить місць. */
const MAX_SPIRAL_STEPS = 400;

/**
 * Розкладає кілька маркерів навколо центру міста спіраллю соняшника.
 *
 * Адреса виконавця нам не потрібна й показувати її не можна, тож
 * положення в межах міста умовне. Спіраль дає щільну купку без
 * накладань і однаковий результат на кожен рендер, без випадковості.
 *
 * `accept` відсіює непридатні місця: в Одеси чи Миколаєва половина
 * спіралі припадає на море, і маркер там виглядав би як помилка. Тоді
 * спіраль просто йде далі, до наступного витка на суходолі.
 */
export const scatterAround = (
  center: GeoPoint,
  count: number,
  spacingKm: number,
  accept: (point: GeoPoint) => boolean = () => true
): GeoPoint[] => {
  const points: GeoPoint[] = [];
  for (let i = 0; points.length < count && i < MAX_SPIRAL_STEPS; i++) {
    // +0.5, щоб перша точка не лягала рівно в центр, під підпис міста.
    const radius = spacingKm * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    const point = offsetKm(center, radius * Math.cos(angle), radius * Math.sin(angle));
    if (accept(point)) points.push(point);
  }
  return points;
};

/**
 * Одна точка на відстані `radiusKm` від центру. Напрямок починається з
 * `startAngleDeg` (0: схід, −90: південь) і обертається кроком 30°,
 * поки `accept` не погодиться: у приморського міста південь буває морем.
 */
export const placeNear = (
  center: GeoPoint,
  radiusKm: number,
  startAngleDeg: number,
  accept: (point: GeoPoint) => boolean = () => true
): GeoPoint => {
  for (let step = 0; step < 12; step++) {
    const angle = ((startAngleDeg + step * 30) * Math.PI) / 180;
    const point = offsetKm(center, radiusKm * Math.cos(angle), radiusKm * Math.sin(angle));
    if (accept(point)) return point;
  }
  return center;
};

/** Відстань великим колом, км. */
export const distanceKm = (a: GeoPoint, b: GeoPoint): number => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
