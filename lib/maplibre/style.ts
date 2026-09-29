// lib/maplibre/style.ts
//
// Стиль MapLibre-варіанта карти в палітрі глобуса (DESIGN.md). Дані
// OpenStreetMap у схемі OpenMapTiles з OpenFreeMap: без ключів і лімітів,
// комерційне використання дозволене. Згодом той самий стиль піде на власні
// PMTiles у Cloudflare R2, тут зміниться лише адреса джерела.
//
// Перший кадр статичний і весь наш: текстури глобуса в Меркаторі
// (public/map), шрифти, контур України, люди й запити. Дані OSM і рельєф
// з мережі вмикаються лише з DETAIL_ZOOM, коли людина вже наближається,
// а картинка плавно тане під ними.
//
// Рельєф: відкриті тайли висот AWS Terrain Tiles (terrarium), ті самі, з
// яких зібрана текстура глобуса.

import type { StyleSpecification } from "maplibre-gl";
import type { GeoJSON } from "geojson";
import ukraine from "@/lib/globe/data/ukraine.geo.json";
import { GLOBE_PALETTE as P } from "@/lib/globe/palette";
import { DETAIL_ZOOM, STATIC_MAP, corners } from "@/lib/maplibre/static";

/** Шрифти підписів з OpenFreeMap, мають кирилицю. */
export const FONT_REGULAR = ["Noto Sans Regular"];
export const FONT_BOLD = ["Noto Sans Bold"];

/** Масштаб, з якого з'являються об'ємні будинки. */
export const BUILDINGS_ZOOM = 13;

/** Плато України підняте на масштабі країни й тоне в землю ближче до міста. */
const PLATEAU_HEIGHT = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  26000,
  6.5,
  14000,
  8.5,
  0,
] as const;

/** Шар тане, коли з'являються дані OSM. */
const fadeOut = ["interpolate", ["linear"], ["zoom"], DETAIL_ZOOM, 1, DETAIL_ZOOM + 1.5, 0] as unknown as number;
/** Шар OSM проявляється з DETAIL_ZOOM. */
const fadeIn = ["interpolate", ["linear"], ["zoom"], DETAIL_ZOOM, 0, DETAIL_ZOOM + 1, 1] as unknown as number;

/** `origin` — адреса сайту: гліфам MapLibre потрібна абсолютна URL. */
export const buildMapStyle = (origin: string): StyleSpecification => ({
  version: 8,
  projection: { type: "globe" },
  glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
  sky: {
    "sky-color": P.sky,
    "horizon-color": P.haze,
    "fog-color": P.haze,
    "sky-horizon-blend": 0.7,
    "horizon-fog-blend": 0.8,
    "fog-ground-blend": 0.35,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.6, 9, 0],
  },
  light: { anchor: "viewport", color: "#ffffff", intensity: 0.32, position: [1.4, 200, 35] },
  sources: {
    osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    relief: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 12,
      attribution: "Рельєф: AWS Terrain Tiles",
    },
    ukraine: { type: "geojson", data: ukraine as unknown as GeoJSON },
    world: { type: "image", url: `${origin}/map/world.webp`, coordinates: corners(STATIC_MAP.world) },
    region: { type: "image", url: `${origin}/map/region.webp`, coordinates: corners(STATIC_MAP.region) },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": P.land } },
    {
      id: "world-static",
      type: "raster",
      source: "world",
      maxzoom: DETAIL_ZOOM + 1.5,
      paint: { "raster-opacity": fadeOut, "raster-fade-duration": 0, "raster-resampling": "linear" },
    },
    {
      id: "region-static",
      type: "raster",
      source: "region",
      maxzoom: DETAIL_ZOOM + 1.5,
      paint: { "raster-opacity": fadeOut, "raster-fade-duration": 0, "raster-resampling": "linear" },
    },
    {
      id: "relief",
      type: "hillshade",
      source: "relief",
      minzoom: DETAIL_ZOOM,
      paint: {
        "hillshade-shadow-color": P.landShadow,
        "hillshade-highlight-color": "#ffffff",
        "hillshade-accent-color": P.landShadow,
        "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 12, 0.2],
      },
    },
    {
      id: "park",
      type: "fill",
      source: "osm",
      "source-layer": "park",
      minzoom: 10,
      paint: { "fill-color": "#e7efe9", "fill-opacity": 0.8 },
    },
    {
      id: "water",
      type: "fill",
      source: "osm",
      "source-layer": "water",
      minzoom: DETAIL_ZOOM,
      paint: {
        "fill-color": ["interpolate", ["linear"], ["zoom"], 4, P.waterDeep, 9, P.waterShallow],
        "fill-opacity": fadeIn,
      },
    },
    {
      id: "waterway",
      type: "line",
      source: "osm",
      "source-layer": "waterway",
      minzoom: DETAIL_ZOOM,
      paint: {
        "line-color": P.river,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 2, 16, 5],
      },
    },
    // Кордони країн. Спірні ділянки (Крим) не малюємо: межу України дає
    // власний контур, у якому Крим — Україна.
    {
      id: "boundary",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      minzoom: DETAIL_ZOOM,
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]],
      paint: { "line-color": P.border, "line-width": 0.8 },
    },
    {
      id: "road-casing",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#d9dee8",
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 9, 0.6, 14, 4, 17, 16],
      },
    },
    {
      id: "road",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 9, 0.3, 14, 2.6, 17, 13],
      },
    },
    // Україна: піднята плита з синім контуром, як на глобусі. Ближче до
    // міста осідає, щоб не накривати вулиці й будинки.
    {
      id: "ukraine-plateau",
      type: "fill-extrusion",
      source: "ukraine",
      maxzoom: 9,
      paint: {
        "fill-extrusion-color": P.ukraineCap,
        "fill-extrusion-height": PLATEAU_HEIGHT as unknown as number,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.92,
      },
    },
    {
      id: "ukraine-outline",
      type: "line",
      source: "ukraine",
      maxzoom: 10,
      paint: {
        "line-color": P.ukraineStroke,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 9, 2],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 10, 0],
      },
    },
    // Місто: білі «глиняні» будинки з реальною висотою з OpenStreetMap.
    {
      id: "buildings",
      type: "fill-extrusion",
      source: "osm",
      "source-layer": "building",
      minzoom: BUILDINGS_ZOOM,
      paint: {
        "fill-extrusion-color": "#fbfcfe",
        "fill-extrusion-height": [
          "interpolate", ["linear"], ["zoom"],
          BUILDINGS_ZOOM, 0,
          BUILDINGS_ZOOM + 1, ["coalesce", ["get", "render_height"], 6],
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.95,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "street-names",
      type: "symbol",
      source: "osm",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:uk"], ["get", "name"]],
        "text-font": FONT_REGULAR,
        "text-size": 11,
      },
      paint: { "text-color": "#7b8494", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
    },
  ],
});
