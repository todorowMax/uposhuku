// lib/map/outline.ts
//
// Контур України як SVG-шлях у Меркаторі, та сама форма, що на карті.
// Чиста функція без браузера: рахується на сервері, і шлях приходить уже
// в HTML-заставці, до завантаження будь-якого JS.

import ukraine from "@/lib/map/data/ukraine.geo.json";
import { CITIES } from "@/lib/map/cities";

type Ring = number[][];

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export interface UkraineOutline {
  width: number;
  height: number;
  path: string;
  cities: { id: string; x: number; y: number }[];
}

export const ukraineOutline = (width = 600, pad = 12): UkraineOutline => {
  const geometry = (ukraine as { geometry: { type: string; coordinates: Ring[][] | Ring[] } }).geometry;
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as Ring[][];
  const outer = polygons.map((polygon) => polygon[0]);
  const points = outer.flat();
  const lngMin = Math.min(...points.map((p) => p[0]));
  const lngMax = Math.max(...points.map((p) => p[0]));
  const yMax = Math.max(...points.map((p) => mercatorY(p[1])));
  const yMin = Math.min(...points.map((p) => mercatorY(p[1])));
  const scale = (width - pad * 2) / (((lngMax - lngMin) * Math.PI) / 180);
  const project = (lng: number, lat: number): [number, number] => [
    pad + (((lng - lngMin) * Math.PI) / 180) * scale,
    pad + (yMax - mercatorY(lat)) * scale,
  ];
  // Дрібні острівці й коси губляться в масштабі заставки, лишаємо суттєве.
  const path = outer
    .filter((ring) => ring.length > 12)
    .map((ring) => "M" + ring.map(([lng, lat]) => project(lng, lat).map((v) => v.toFixed(1)).join(",")).join("L") + "Z")
    .join("");
  const cities = CITIES.filter((city) => city.label).map((city) => {
    const [x, y] = project(city.lng, city.lat);
    return { id: city.id, x, y };
  });
  return { width, height: (yMax - yMin) * scale + pad * 2, path, cities };
};
