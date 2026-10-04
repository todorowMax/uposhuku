// lib/maplibre/place-labels.ts
//
// Підписи міст, селищ і районів для карти вибору точки. На головній карті
// міста підписані власними елементами, а тут людині треба орієнтуватися,
// тож додаємо підписи з тих самих тайлів OpenStreetMap поверх спільного стилю.

import type { LayerSpecification } from "maplibre-gl";
import { FONT_BOLD, FONT_REGULAR } from "@/lib/maplibre/style";

const NAME = ["coalesce", ["get", "name:uk"], ["get", "name"]] as never;

export const PLACE_LABEL_LAYERS: LayerSpecification[] = [
  {
    id: "place-village",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    minzoom: 9,
    filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "neighbourhood"]]],
    layout: { "text-field": NAME, "text-font": FONT_REGULAR, "text-size": 11 },
    paint: { "text-color": "#427484", "text-halo-color": "#dce7e4", "text-halo-width": 1.4 },
  },
  {
    id: "place-city",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
    layout: { "text-field": NAME, "text-font": FONT_BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 12, 16] },
    paint: { "text-color": "#00364a", "text-halo-color": "#dce7e4", "text-halo-width": 1.6 },
  },
];
