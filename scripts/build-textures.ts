// scripts/build-textures.ts
//
// Малює рівнокутні текстури Землі й контур України з відкритих даних. Результат
// лежить у git, скрипт потрібен лише щоб перемалювати: інша палітра,
// інші межі латки, свіжіші кордони.
//
// Джерела:
// - рельєф і глибини: AWS Terrain Tiles (Terrarium), відкриті дані
//   Mapzen, https://registry.opendata.aws/terrain-tiles/
// - кордони, річки, озера: Natural Earth, суспільне надбання.
//
// Кордони беремо з `ne_10m_admin_0_countries_ukr`, версії Natural Earth
// з погляду України. У звичайних файлах `ne_*_admin_0_countries` Крим
// віднесено до Росії, для нас це неприйнятно.
//
// Полотно: @napi-rs/canvas, лише як devDependency. Скрипт запускається
// руками, у збірку воркера ця залежність не потрапляє.
//
// Запуск: npm run map:textures (завантаження кешуються в .cache/textures),
// потім npm run map:assets, щоб перепроєктувати їх для карти.

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_PALETTE, hexToRgb } from "../lib/map/palette";
import { REGION, WORLD_TEXTURE_WIDTH, regionSize, type GeoBounds } from "../lib/map/region";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const cacheDir = resolve(root, ".cache/textures");
const outDir = resolve(root, "assets/textures");
const dataDir = resolve(root, "lib/map/data");

const NATURAL_EARTH =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";

/** Каховське водосховище спущене після підриву греблі у 2023 році. */
const DRAINED_LAKES = new Set(["Kakhovka Reservoir"]);

type Position = [number, number];
type Ring = Position[];
type PolygonCoords = Ring[];

interface Feature {
  properties: Record<string, unknown>;
  geometry:
    | { type: "Polygon"; coordinates: PolygonCoords }
    | { type: "MultiPolygon"; coordinates: PolygonCoords[] }
    | { type: "LineString"; coordinates: Ring }
    | { type: "MultiLineString"; coordinates: Ring[] };
}

// ---------------------------------------------------------------------------
// Завантаження з кешем

const download = async (url: string, file: string): Promise<Buffer> => {
  const path = resolve(cacheDir, file);
  if (existsSync(path)) return readFileSync(path);
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buffer);
      return buffer;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt));
    }
  }
};

const naturalEarth = async (name: string): Promise<Feature[]> => {
  const buffer = await download(`${NATURAL_EARTH}${name}.geojson`, `ne/${name}.geojson`);
  return (JSON.parse(buffer.toString()) as { features: Feature[] }).features;
};

const polygonsOf = (feature: Feature): PolygonCoords[] => {
  const { geometry } = feature;
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
};

const linesOf = (feature: Feature): Ring[] => {
  const { geometry } = feature;
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
};

// ---------------------------------------------------------------------------
// Висоти: мозаїка тайлів Terrarium у Меркаторі → сітка в рівнокутній

const MAX_MERCATOR_LAT = 85.0511;

const tileX = (lng: number, zoom: number) => ((lng + 180) / 360) * 2 ** zoom;
const tileY = (lat: number, zoom: number) => {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
};

interface Grid {
  width: number;
  height: number;
  bounds: GeoBounds;
}

const lngAt = (grid: Grid, x: number) =>
  grid.bounds.lngMin + ((x + 0.5) / grid.width) * (grid.bounds.lngMax - grid.bounds.lngMin);
const latAt = (grid: Grid, y: number) =>
  grid.bounds.latMax - ((y + 0.5) / grid.height) * (grid.bounds.latMax - grid.bounds.latMin);

const elevationGrid = async (grid: Grid, zoom: number): Promise<Float32Array> => {
  const n = 2 ** zoom;
  const x0 = Math.max(0, Math.floor(tileX(grid.bounds.lngMin, zoom)));
  const x1 = Math.min(n - 1, Math.floor(tileX(grid.bounds.lngMax, zoom) - 1e-9));
  const y0 = Math.max(0, Math.floor(tileY(grid.bounds.latMax, zoom)));
  const y1 = Math.min(n - 1, Math.floor(tileY(grid.bounds.latMin, zoom) - 1e-9));
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const mosaicWidth = cols * 256;
  const mosaicHeight = rows * 256;
  const mosaic = new Float32Array(mosaicWidth * mosaicHeight);

  const tile = createCanvas(256, 256);
  const tileCtx = tile.getContext("2d");
  let done = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const png = await download(`${TERRARIUM}${zoom}/${tx}/${ty}.png`, `terrarium/${zoom}/${tx}/${ty}.png`);
      tileCtx.clearRect(0, 0, 256, 256);
      tileCtx.drawImage(await loadImage(png), 0, 0);
      const { data } = tileCtx.getImageData(0, 0, 256, 256);
      for (let py = 0; py < 256; py++) {
        const row = ((ty - y0) * 256 + py) * mosaicWidth + (tx - x0) * 256;
        for (let px = 0; px < 256; px++) {
          const i = (py * 256 + px) * 4;
          // Кодування Terrarium: метри = R·256 + G + B/256 − 32768.
          mosaic[row + px] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
        }
      }
      done++;
    }
    process.stdout.write(`\r  тайли z${zoom}: ${done}/${cols * rows}`);
  }
  process.stdout.write("\n");

  const out = new Float32Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y++) {
    const my = Math.min(mosaicHeight - 1.001, Math.max(0, (tileY(latAt(grid, y), zoom) - y0) * 256 - 0.5));
    const iy = Math.floor(my);
    const fy = my - iy;
    for (let x = 0; x < grid.width; x++) {
      const mx = Math.min(mosaicWidth - 1.001, Math.max(0, (tileX(lngAt(grid, x), zoom) - x0) * 256 - 0.5));
      const ix = Math.floor(mx);
      const fx = mx - ix;
      const a = mosaic[iy * mosaicWidth + ix];
      const b = mosaic[iy * mosaicWidth + ix + 1];
      const c = mosaic[(iy + 1) * mosaicWidth + ix];
      const d = mosaic[(iy + 1) * mosaicWidth + ix + 1];
      out[y * grid.width + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Растеризація векторів у ту саму рівнокутну сітку

const project = (grid: Grid, [lng, lat]: Position): Position => [
  ((lng - grid.bounds.lngMin) / (grid.bounds.lngMax - grid.bounds.lngMin)) * grid.width,
  ((grid.bounds.latMax - lat) / (grid.bounds.latMax - grid.bounds.latMin)) * grid.height,
];

const tracePolygon = (ctx: SKRSContext2D, grid: Grid, polygon: PolygonCoords) => {
  for (const ring of polygon) {
    ring.forEach((point, i) => {
      const [x, y] = project(grid, point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
};

/** Маска 0..1: білим по чорному, з антиаліасингом полотна. */
const rasterMask = (grid: Grid, draw: (ctx: SKRSContext2D) => void): Float32Array => {
  const canvas = createCanvas(grid.width, grid.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, grid.width, grid.height);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  draw(ctx);
  const { data } = ctx.getImageData(0, 0, grid.width, grid.height);
  const mask = new Float32Array(grid.width * grid.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] / 255;
  return mask;
};

const boxBlur = (src: Float32Array, width: number, height: number, radius: number) => {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += src[y * width + Math.min(width - 1, Math.max(0, x + k))];
      }
      tmp[y * width + x] = sum / span;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x];
      }
      out[y * width + x] = sum / span;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Відмивка рельєфу

/**
 * Освітленість відносно рівнини: 1 на рівному, менше на схилах у тіні,
 * більше на схилах до світла. Світло з північного заходу, як на
 * топографічних картах: так гори читаються опуклими, а не западинами.
 */
const hillshade = (elevation: Float32Array, grid: Grid, exaggeration: number) => {
  const { width, height } = grid;
  const shade = new Float32Array(width * height);
  const degX = (grid.bounds.lngMax - grid.bounds.lngMin) / width;
  const degY = (grid.bounds.latMax - grid.bounds.latMin) / height;
  const azimuth = (315 * Math.PI) / 180;
  const altitude = (40 * Math.PI) / 180;
  const lx = Math.sin(azimuth) * Math.cos(altitude);
  const ly = Math.cos(azimuth) * Math.cos(altitude);
  const lz = Math.sin(altitude);
  for (let y = 0; y < height; y++) {
    const lat = latAt(grid, y);
    // За межами Меркатора тайлів немає, рядки там однакові й дають смуги.
    // Біля полюсів рельєф не потрібен: там рівно.
    if (Math.abs(lat) > MAX_MERCATOR_LAT - 1.5) {
      shade.fill(1, y * width, (y + 1) * width);
      continue;
    }
    const metersX = Math.max(200, degX * 111_320 * Math.cos((lat * Math.PI) / 180));
    const metersY = degY * 110_574;
    const up = Math.max(0, y - 1);
    const down = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      // Схід додатний по x, північ додатна по y: рядки сітки йдуть з півночі.
      const dzdx =
        (elevation[y * width + right] - elevation[y * width + left]) / ((right - left) * metersX);
      const dzdy =
        (elevation[up * width + x] - elevation[down * width + x]) / ((down - up) * metersY);
      const nx = -dzdx * exaggeration;
      const ny = -dzdy * exaggeration;
      const length = Math.hypot(nx, ny, 1);
      shade[y * width + x] = Math.max(0, (nx * lx + ny * ly + lz) / length) / lz;
    }
  }
  return shade;
};

// ---------------------------------------------------------------------------
// Збирання кольору

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (edge0: number, edge1: number, v: number) => {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

interface PaintOptions {
  grid: Grid;
  zoom: number;
  exaggeration: number;
  countries: Feature[];
  lakes: Feature[];
  rivers: Feature[];
  riverScale: number;
  borderWidth: number;
  /** Радіус розмиття глибин, пікселі. */
  depthBlur: number;
  out: string;
  quality: number;
}

const paint = async (options: PaintOptions) => {
  const { grid } = options;
  const { width, height } = grid;
  const elevation = await elevationGrid(grid, options.zoom);
  const shade = hillshade(elevation, grid, options.exaggeration);

  const land = rasterMask(grid, (ctx) => {
    ctx.beginPath();
    for (const country of options.countries) {
      for (const polygon of polygonsOf(country)) tracePolygon(ctx, grid, polygon);
    }
    ctx.fill("evenodd");
  });
  const lake = rasterMask(grid, (ctx) => {
    ctx.beginPath();
    for (const feature of options.lakes) {
      for (const polygon of polygonsOf(feature)) tracePolygon(ctx, grid, polygon);
    }
    ctx.fill("evenodd");
  });
  // Кордони малюємо як контури країн. Узбережжя теж контур, але там
  // по один бік вода: ширша маска суходолу гасить лінію на березі й
  // лишає її тільки між двома країнами.
  const border = rasterMask(grid, (ctx) => {
    ctx.lineWidth = options.borderWidth;
    ctx.lineJoin = "round";
    for (const country of options.countries) {
      ctx.beginPath();
      for (const polygon of polygonsOf(country)) tracePolygon(ctx, grid, polygon);
      ctx.stroke();
    }
  });
  const landWide = boxBlur(land, width, height, 2);
  // Глибину розмиваємо, щоб бровка шельфу була градієнтом, а не сходинкою.
  const rawDepth = new Float32Array(width * height);
  for (let i = 0; i < rawDepth.length; i++) rawDepth[i] = Math.max(0, -elevation[i]);
  const depthField = boxBlur(
    boxBlur(rawDepth, width, height, options.depthBlur),
    width,
    height,
    options.depthBlur
  );

  const p = {
    land: hexToRgb(MAP_PALETTE.land),
    shadow: hexToRgb(MAP_PALETTE.landShadow),
    border: hexToRgb(MAP_PALETTE.border),
    shallow: hexToRgb(MAP_PALETTE.waterShallow),
    deep: hexToRgb(MAP_PALETTE.waterDeep),
  };

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  const px = image.data;
  for (let i = 0; i < width * height; i++) {
    const isLake = lake[i];
    const landness = land[i] * (1 - isLake);

    // Суходіл: сірий, тіні в холодний сірий, світло трохи в білий.
    const light = shade[i] - 1;
    const toShadow = clamp01(-light * 1.7);
    const toWhite = clamp01(light * 1.1);
    const borderMix = border[i] * smoothstep(0.8, 0.97, landWide[i]) * 0.9;
    const landRgb = [0, 1, 2].map((c) => {
      const base = mix(mix(p.land[c], p.shadow[c], toShadow), 255, toWhite);
      return mix(base, p.border[c], borderMix);
    });

    // Вода: глибина дає колір, відмивка дна ледь помітна, щоб читався
    // схил шельфу. Озера й водосховища завжди «мілкі».
    const depth = depthField[i] * (1 - isLake);
    const t = smoothstep(0, 1, Math.sqrt(depth / 2200));
    const bottom = clamp01(1 + (shade[i] - 1) * 0.08);
    const waterRgb = [0, 1, 2].map((c) => mix(p.shallow[c], p.deep[c], t) * bottom);

    px[i * 4] = mix(waterRgb[0], landRgb[0], landness);
    px[i * 4 + 1] = mix(waterRgb[1], landRgb[1], landness);
    px[i * 4 + 2] = mix(waterRgb[2], landRgb[2], landness);
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // Річки поверх: тонко, головні трохи товщі.
  if (options.rivers.length > 0) {
    ctx.strokeStyle = MAP_PALETTE.river;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const river of options.rivers) {
      const rank = Number(river.properties.scalerank ?? 10);
      // Дрібні притоки на масштабі країни перетворюють карту на павутину.
      if (rank > 10) continue;
      ctx.lineWidth = options.riverScale * (rank <= 4 ? 1.9 : rank <= 7 ? 1.3 : 0.9);
      ctx.globalAlpha = rank <= 7 ? 0.95 : 0.6;
      ctx.beginPath();
      for (const line of linesOf(river)) {
        line.forEach((point, i) => {
          const [x, y] = project(grid, point);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const bytes = await canvas.encode("webp", options.quality);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, options.out), bytes);
  console.log(`  ${options.out}: ${width}×${height}, ${(bytes.length / 1024).toFixed(0)} КБ`);
};

// ---------------------------------------------------------------------------
// Контур України для 3D-плато

/** Дуглас-Пекер: викидає точки, що відхиляються менше ніж на tolerance. */
const simplify = (ring: Ring, tolerance: number): Ring => {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = ring[start];
    const [bx, by] = ring[end];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let maxDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = ring[i];
      // Замкнене кільце починається й закінчується в одній точці: відрізка
      // немає, міряємо відстань до самої точки.
      const distance =
        length === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return ring.filter((_, i) => keep[i]);
};

const ringArea = (ring: Ring) => {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(area / 2);
};

const writeUkraine = (countries: Feature[]) => {
  const ukraine = countries.find((feature) => feature.properties.ADM0_A3 === "UKR");
  if (!ukraine) throw new Error("У наборі Natural Earth немає України");
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const polygons = polygonsOf(ukraine)
    // Острівці менші за кілька км² на такому масштабі лише шум.
    .filter((polygon) => ringArea(polygon[0]) > 0.004)
    .map((polygon) =>
      polygon
        .map((ring) => simplify(ring, 0.006).map(([lng, lat]): Position => [round(lng), round(lat)]))
        .filter((ring) => ring.length >= 4)
    );
  const feature = {
    type: "Feature",
    properties: { name: "Україна", iso: "UA" },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
  mkdirSync(dataDir, { recursive: true });
  const json = JSON.stringify(feature);
  writeFileSync(resolve(dataDir, "ukraine.geo.json"), `${json}\n`);
  const points = polygons.flat().reduce((sum, ring) => sum + ring.length, 0);
  console.log(`  ukraine.geo.json: ${polygons.length} полігон(и), ${points} точок, ${(json.length / 1024).toFixed(0)} КБ`);
};

// ---------------------------------------------------------------------------

const intersects = (feature: Feature, bounds: GeoBounds) => {
  const inside = ([lng, lat]: Position) =>
    lng >= bounds.lngMin && lng <= bounds.lngMax && lat >= bounds.latMin && lat <= bounds.latMax;
  return (
    polygonsOf(feature).some((polygon) => polygon[0].some(inside)) ||
    linesOf(feature).some((line) => line.some(inside))
  );
};

const main = async () => {
  console.log("Natural Earth…");
  const countries = await naturalEarth("ne_10m_admin_0_countries_ukr");
  const lakes = (await naturalEarth("ne_10m_lakes")).filter(
    (lake) => !DRAINED_LAKES.has(String(lake.properties.name))
  );
  const rivers = [
    ...(await naturalEarth("ne_10m_rivers_lake_centerlines")),
    ...(await naturalEarth("ne_10m_rivers_europe")),
  ];

  console.log("Контур України…");
  writeUkraine(countries);

  console.log("Латка навколо України…");
  const region: Grid = { ...regionSize(), bounds: REGION };
  await paint({
    grid: region,
    zoom: 7,
    exaggeration: 7,
    countries: countries.filter((c) => intersects(c, REGION)),
    lakes: lakes.filter((l) => intersects(l, REGION)),
    rivers: rivers.filter((r) => intersects(r, REGION)),
    riverScale: 1,
    borderWidth: 1.1,
    depthBlur: 6,
    out: "region.webp",
    quality: 84,
  });

  console.log("Уся Земля…");
  const world: Grid = {
    width: WORLD_TEXTURE_WIDTH,
    height: WORLD_TEXTURE_WIDTH / 2,
    bounds: { lngMin: -180, lngMax: 180, latMin: -90, latMax: 90 },
  };
  await paint({
    grid: world,
    zoom: 4,
    exaggeration: 18,
    countries,
    lakes,
    rivers: [],
    riverScale: 0,
    borderWidth: 0.8,
    depthBlur: 1,
    out: "earth.webp",
    quality: 80,
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
