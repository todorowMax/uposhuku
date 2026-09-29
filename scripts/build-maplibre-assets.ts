// scripts/build-maplibre-assets.ts
//
// Статичний перший кадр карти: усе, що потрібно на масштабі
// країни, лежить у нас і віддається одразу, без походів у мережу.
//
// 1. Текстури Землі (assets/textures/earth.webp і region.webp) у Web
//    Mercator. Вони в рівнокутній проєкції (широта лінійна), а MapLibre
//    тягне картинку між кутами лінійно в Меркаторі: без перепроєкції
//    Україна з'їхала б приблизно на 1° (близько 100 км).
// 2. Гліфи підписів (Noto Sans з OpenFreeMap) для латиниці, кирилиці й
//    типографських знаків, щоб назви міст з'являлися разом з картою.
//
// Результат лежить у git (public/map), як і самі текстури.
// Запуск: npm run map:assets

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGION } from "../lib/map/region";
import { STATIC_MAP } from "../lib/maplibre/static";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/map");

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * Перепроєкція рядками: стовпці (довгота) лишаються, для кожного рядка
 * результату беремо рядок джерела на тій самій широті.
 */
const toMercator = async (
  file: string,
  bounds: { latMin: number; latMax: number },
  sourceLat: { top: number; bottom: number },
  width: number,
  out: string
) => {
  const image = await loadImage(resolve(root, file));
  const yTop = mercatorY(bounds.latMax);
  const yBottom = mercatorY(bounds.latMin);
  // Висота зберігає пропорції пікселя в Меркаторі на середній широті.
  const degPerPx = (sourceLat.top - sourceLat.bottom) / image.height;
  const height = Math.round((yTop - yBottom) / ((degPerPx * Math.PI) / 180));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  for (let row = 0; row < height; row++) {
    const y = yTop - ((row + 0.5) / height) * (yTop - yBottom);
    const lat = (Math.atan(Math.sinh(y)) * 180) / Math.PI;
    const sourceRow = ((sourceLat.top - lat) / (sourceLat.top - sourceLat.bottom)) * image.height;
    context.drawImage(image, 0, Math.max(0, sourceRow - 0.5), image.width, 1, 0, row, width, 1);
  }
  const bytes = await canvas.encode("webp", 86);
  writeFileSync(resolve(outDir, out), bytes);
  console.log(`  ${out}: ${width}×${height}, ${(bytes.length / 1024).toFixed(0)} КБ`);
};

const GLYPH_RANGES = ["0-255", "256-511", "1024-1279", "8192-8447"];
const FONTS = ["Noto Sans Regular", "Noto Sans Bold"];

const main = async () => {
  mkdirSync(outDir, { recursive: true });

  // Уся Земля, але Меркатор не доходить до полюсів: ріжемо по межах картинки.
  await toMercator(
    "assets/textures/earth.webp",
    STATIC_MAP.world,
    { top: 90, bottom: -90 },
    4096,
    "world.webp"
  );
  await toMercator(
    "assets/textures/region.webp",
    STATIC_MAP.region,
    { top: REGION.latMax, bottom: REGION.latMin },
    3040,
    "region.webp"
  );

  for (const font of FONTS) {
    const dir = resolve(outDir, "fonts", font);
    mkdirSync(dir, { recursive: true });
    for (const range of GLYPH_RANGES) {
      const url = `https://tiles.openfreemap.org/fonts/${encodeURIComponent(font)}/${range}.pbf`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      writeFileSync(resolve(dir, `${range}.pbf`), Buffer.from(await response.arrayBuffer()));
    }
    console.log(`  fonts/${font}: ${GLYPH_RANGES.join(", ")}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
