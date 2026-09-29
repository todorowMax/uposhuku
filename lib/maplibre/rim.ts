// lib/maplibre/rim.ts
//
// Синя кромка плато України. fill-extrusion фарбує стінки й верх одним
// кольором, тож окремо синіх стінок і синього контуру по верхньому краю
// з одного шару не отримати. Тому поруч із плато стоїть другий шар: тонка
// стрічка вздовж кордону назовні, піднята на ту саму висоту. Її зовнішня
// стінка — синя стінка плато, її верх — синій контур по краю.

import type { Feature, MultiPolygon, Position } from "geojson";
import ukraine from "@/lib/map/data/ukraine.geo.json";

type Ring = Position[];

const KM_PER_DEG = 111.32;

/** Подвоєна площа кільця зі знаком: > 0, якщо обхід проти годинникової стрілки. */
const signedArea = (ring: Ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum;
};

/**
 * Стрічка шириною `widthKm` назовні від кожного зовнішнього кільця.
 *
 * Складена з трикутників: по два на ребро кордону, між вершиною кордону і
 * її зсунутою копією. Сусідні ребра ділять зсунуту вершину, тож щілин між
 * шматками немає і внутрішні стінки ховаються в товщі стрічки, без
 * вертикальних смуг на стінці плато.
 *
 * Не кільцем з дірою: у вузьких лиманах зсунуте кільце перетинає саме
 * себе, MapLibre ріже такий багатокутник на трикутники хибно, і через
 * пів країни тягнуться довгі тонкі «скалки». Трикутник завжди простий.
 */
export const ukraineRim = (widthKm: number): Feature<MultiPolygon> => {
  const geometry = (ukraine as { geometry: { type: string; coordinates: Ring[][] | Ring[] } }).geometry;
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as Ring[][];
  const rims = polygons.map(([outer]) => {
    const ring = outer.slice(0, -1);
    // Зовнішня нормаль лежить праворуч від ребра при обході проти годинникової.
    const side = signedArea(outer) > 0 ? 1 : -1;
    const n = ring.length;
    // Одинична нормаль кожного ребра в кілометрах, щоб її не сплющувало довготою.
    const normals = ring.map(([lng1, lat1], i) => {
      const [lng2, lat2] = ring[(i + 1) % n];
      const cos = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
      const dx = (lng2 - lng1) * cos;
      const dy = lat2 - lat1;
      const length = Math.hypot(dx, dy) || 1;
      return [(side * dy) / length, (-side * dx) / length];
    });
    const shifted = ring.map(([lng, lat], i) => {
      // Вершину зсуваємо вздовж бісектриси сусідніх нормалей, з обмеженим
      // вістрям, щоб гострі кути не стріляли далеко назовні.
      const [ax, ay] = normals[(i - 1 + n) % n];
      const [bx, by] = normals[i];
      let mx = ax + bx;
      let my = ay + by;
      const length = Math.hypot(mx, my);
      if (length < 1e-6) [mx, my] = [bx, by];
      else [mx, my] = [mx / length, my / length];
      const miter = Math.min(2, 1 / Math.max(0.5, mx * bx + my * by));
      const cos = Math.cos((lat * Math.PI) / 180);
      return [
        lng + (mx * widthKm * miter) / (cos * KM_PER_DEG),
        lat + (my * widthKm * miter) / KM_PER_DEG,
      ];
    });
    return ring.flatMap((point, i) => {
      const next = ring[(i + 1) % n];
      const [shiftedPoint, shiftedNext] = [shifted[i], shifted[(i + 1) % n]];
      return [
        [[point, next, shiftedNext, point]],
        [[point, shiftedNext, shiftedPoint, point]],
      ];
    });
  });
  return { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: rims.flat() } };
};
