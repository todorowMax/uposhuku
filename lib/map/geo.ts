// lib/map/geo.ts
import ukraine from "@/lib/map/data/ukraine.geo.json";
import type { GeoPoint } from "./types";

type Ring = number[][];

const inRing = (point: GeoPoint, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

/** Чи лежить точка на суходолі України, за тим самим контуром, що й плато. */
export const inUkraine = (point: GeoPoint): boolean =>
  (ukraine.geometry.coordinates as Ring[][]).some(
    ([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole))
  );
