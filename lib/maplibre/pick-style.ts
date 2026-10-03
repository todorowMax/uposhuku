// lib/maplibre/pick-style.ts
//
// Проста пласка карта для вибору точки (профіль виконавця): дороги, води,
// будинки й підписи міст з OpenFreeMap, у палітрі застосунку. Без глобуса,
// рельєфу й статичних картинок: тут головне — зручно наблизитись до вулиці.

import type { StyleSpecification } from "maplibre-gl";
import { MAP_PALETTE as P } from "@/lib/map/palette";
import { FONT_BOLD, FONT_REGULAR } from "@/lib/maplibre/style";

const NAME = ["coalesce", ["get", "name:uk"], ["get", "name"]] as never;

export const buildPickStyle = (origin: string): StyleSpecification => ({
  version: 8,
  glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
  sources: { osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": P.land } },
    { id: "park", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": "#d7e6dd", "fill-opacity": 0.85 } },
    { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": P.waterShallow } },
    { id: "waterway", type: "line", source: "osm", "source-layer": "waterway", paint: { "line-color": P.river, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 14, 3] } },
    { id: "boundary", type: "line", source: "osm", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]], paint: { "line-color": P.border, "line-width": 1 } },
    {
      id: "road-casing",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#cdd9d8", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, 0.5, 14, 4, 18, 18] },
    },
    {
      id: "road",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f8faf9", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, 0.25, 14, 2.6, 18, 14] },
    },
    { id: "building", type: "fill", source: "osm", "source-layer": "building", minzoom: 14, paint: { "fill-color": "#d9e0de", "fill-opacity": 0.9 } },
    {
      id: "place-village",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "neighbourhood"]]],
      layout: { "text-field": NAME, "text-font": FONT_REGULAR, "text-size": 11 },
      paint: { "text-color": "#69777f", "text-halo-color": "#f9faf9", "text-halo-width": 1.4 },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: { "text-field": NAME, "text-font": FONT_BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 12, 16] },
      paint: { "text-color": "#30363a", "text-halo-color": "#f9faf9", "text-halo-width": 1.6 },
    },
  ],
});
