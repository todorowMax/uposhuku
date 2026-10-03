// lib/maplibre/style.ts
//
// Стиль карти MapLibre у палітрі з DESIGN.md. Дані
// OpenStreetMap у схемі OpenMapTiles з OpenFreeMap: без ключів і лімітів,
// комерційне використання дозволене. Згодом той самий стиль піде на власні
// PMTiles у Cloudflare R2, тут зміниться лише адреса джерела.
//
// Перший кадр статичний і весь наш: власні текстури в Меркаторі
// (public/map), шрифти, контур України, люди й запити. Дані OSM і рельєф
// з мережі вмикаються лише з DETAIL_ZOOM, коли людина вже наближається,
// а картинка плавно тане під ними.
//
// Рельєф: відкриті тайли висот AWS Terrain Tiles (terrarium), ті самі, з
// яких зібрані наші текстури.

import type { StyleSpecification } from "maplibre-gl";
import type { GeoJSON } from "geojson";
import ukraine from "@/lib/map/data/ukraine.geo.json";
import { MAP_PALETTE as P } from "@/lib/map/palette";
import { DETAIL_ZOOM, STATIC_MAP, corners } from "@/lib/maplibre/static";
import { ukraineRim } from "@/lib/maplibre/rim";

/** Шрифти підписів з OpenFreeMap, мають кирилицю. */
export const FONT_REGULAR = ["Noto Sans Regular"];
export const FONT_BOLD = ["Noto Sans Bold"];

/** Масштаб, з якого з'являються об'ємні будинки. */
export const BUILDINGS_ZOOM = 13;

/**
 * Україна трохи піднята над картою. Нижче, ніж була синя плита (26 км):
 * лише щоб країна читалася об'ємом, а світлова точка на кордоні
 * лишалася біля підніжжя. Ближче до міста плита осідає в землю.
 */
const PLATEAU_HEIGHT = ["interpolate", ["linear"], ["zoom"], 4, 9000, 6.5, 5000, 8.5, 0] as unknown as number;
/** Кромка плато: тонка золота стрічка назовні від кордону, км. */
const RIM_WIDTH_KM = 2.5;
/** Плато й кромка прозорішають, поки осідають. */
const plateauOpacity = (full: number) =>
  ["interpolate", ["linear"], ["zoom"], 6.5, full, 8.5, 0] as unknown as number;

/** Основний суцільний контур; маленькі острови залишаються на статичному шарі. */
export const UKRAINE_TRACE_RING = ukraine.geometry.coordinates[0][0] as [number, number][];

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
    // Над планетою космос (.space-bg), тож небо напівпрозоре: тонкий блакитний
    // ореол атмосфери по краю глобуса, а далі видно зорі.
    "sky-color": "rgba(70,130,220,0.5)",
    "horizon-color": "rgba(160,210,255,0.9)",
    "fog-color": P.haze,
    "sky-horizon-blend": 0.45,
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
    "ukraine-rim": { type: "geojson", data: ukraineRim(RIM_WIDTH_KM) },
    "ukraine-trace": {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: UKRAINE_TRACE_RING }, properties: {} },
      lineMetrics: true,
    },
    "ukraine-trace-head": {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "Point", coordinates: UKRAINE_TRACE_RING[0] }, properties: {} },
    },
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
      paint: {
        "raster-opacity": fadeOut, "raster-fade-duration": 0, "raster-resampling": "linear",
        "raster-saturation": -0.35, "raster-contrast": -0.06, "raster-brightness-max": 0.97,
        "raster-hue-rotate": 335,
      },
    },
    {
      id: "region-static",
      type: "raster",
      source: "region",
      maxzoom: DETAIL_ZOOM + 1.5,
      paint: {
        "raster-opacity": fadeOut, "raster-fade-duration": 0, "raster-resampling": "linear",
        "raster-saturation": -0.35, "raster-contrast": -0.06, "raster-brightness-max": 0.97,
        "raster-hue-rotate": 335,
      },
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
      paint: { "fill-color": "#d7e6dd", "fill-opacity": 0.8 },
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
        "line-color": "#cdd9d8",
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
        "line-color": "#f4f7f5",
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 9, 0.3, 14, 2.6, 17, 13],
      },
    },
    // Плато з ледь помітною теплою заливкою: рельєф і річки всередині
    // країни лишаються видно.
    {
      id: "ukraine-plateau",
      type: "fill-extrusion",
      source: "ukraine",
      maxzoom: 9,
      paint: {
        "fill-extrusion-color": P.ukraineCap,
        "fill-extrusion-height": PLATEAU_HEIGHT,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": plateauOpacity(0.07),
        "fill-extrusion-vertical-gradient": false,
      },
    },
    // Золота стінка по краю: окремий шар, бо fill-extrusion фарбує верх і
    // стінки одним кольором (lib/maplibre/rim.ts).
    {
      id: "ukraine-rim",
      type: "fill-extrusion",
      source: "ukraine-rim",
      maxzoom: 9,
      paint: {
        "fill-extrusion-color": "#b48264",
        "fill-extrusion-height": PLATEAU_HEIGHT,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": plateauOpacity(0.7),
        "fill-extrusion-vertical-gradient": false,
      },
    },
    // Контур і світлова точка — поверх плато.
    {
      id: "ukraine-outline",
      type: "line",
      source: "ukraine",
      maxzoom: 10,
      paint: {
        "line-color": "#b48264",
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.8, 9, 2.4],
        "line-opacity": 0.42,
      },
    },
    {
      id: "ukraine-trace-glow",
      type: "line",
      source: "ukraine-trace",
      maxzoom: 10,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": 10,
        "line-blur": 4,
        "line-opacity": 0,
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,240,205,0)", 1, "rgba(255,240,205,0)"],
      },
    },
    {
      id: "ukraine-trace-core",
      type: "line",
      source: "ukraine-trace",
      maxzoom: 10,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": 3.3,
        "line-opacity": 0,
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,252,238,0)", 1, "rgba(255,252,238,0)"],
      },
    },
    {
      id: "ukraine-trace-dot",
      type: "circle",
      source: "ukraine-trace-head",
      maxzoom: 10,
      paint: {
        "circle-radius": 3.2,
        "circle-color": "#fff9e7",
        "circle-stroke-color": "#d99c70",
        "circle-stroke-width": 1,
        "circle-opacity": 0,
        "circle-pitch-alignment": "viewport",
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
        "fill-extrusion-color": "#f4f7f4",
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
      paint: { "text-color": "#68777a", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
    },
  ],
});
