// scripts/build-space.ts
//
// Малює космос за планетою й атлас хмар. Усе процедурне й детерміноване:
// без завантажень і ліцензій, а результат лежить у public/map і важить
// сотні кілобайт. Хмари окремими спрайтами, щоб на сторінці їх можна було
// рухати з паралаксом (components/maplibre/space-backdrop.tsx).
//
// Запуск: npm run map:space

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/map");
mkdirSync(outDir, { recursive: true });

/** mulberry32: той самий результат при кожному запуску. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const blob = (ctx: SKRSContext2D, x: number, y: number, r: number, color: string, alpha: number) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

// ───────────── космос ─────────────
// Майже чорний, лише кілька десятків зірок: космос — тло, а не окрема картинка.
const space = () => {
  const W = 1920;
  const H = 1200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const random = rng(7);

  ctx.fillStyle = "#010207";
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 170; i++) {
    const x = random() * W;
    const y = random() * H;
    const power = random() ** 5;
    const size = 0.5 + power * 1.6;
    const tint = random() < 0.18 ? "190,215,255" : random() < 0.1 ? "255,232,205" : "255,255,255";
    ctx.fillStyle = `rgba(${tint},${0.3 + power * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (power > 0.6) blob(ctx, x, y, 7 + power * 8, tint, 0.14);
  }
  return canvas.encode("webp", 80);
};

// ───────────── хмари ─────────────
// Купчасті хмари з шуму: щільність із фрактального «шипучого» шуму під
// формою хмари, освітлення з верхнього лівого кута за різницею щільності,
// тінь знизу блакитно-сіра. Виходить об'ємна пишна хмара з м'яким краєм.
const CLOUD_W = 512;
const CLOUD_H = 320;
const COLS = 4;
const ROWS = 2;

const permutation = (seed: number) => {
  const random = rng(seed);
  const table = Array.from({ length: 256 }, (_, index) => index);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [table[i], table[j]] = [table[j], table[i]];
  }
  return [...table, ...table];
};

const makeNoise = (seed: number) => {
  const perm = permutation(seed);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (hash: number, x: number, y: number) => {
    const h = hash & 3;
    return (h === 0 ? x + y : h === 1 ? -x + y : h === 2 ? x - y : -x - y);
  };
  const perlin = (x: number, y: number) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u;
    const x2 = grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u;
    return x1 * (1 - v) + x2 * v;
  };
  /** «Шипучий» фрактальний шум 0..1: гострі западини між круглими горбами. */
  return (x: number, y: number) => {
    let sum = 0;
    let amplitude = 0.55;
    let frequency = 1;
    for (let octave = 0; octave < 6; octave++) {
      sum += (1 - Math.abs(perlin(x * frequency, y * frequency))) * amplitude;
      amplitude *= 0.52;
      frequency *= 2.05;
    }
    return sum;
  };
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const cloud = (ctx: SKRSContext2D, ox: number, oy: number, seed: number) => {
  const random = rng(seed);
  const noise = makeNoise(seed);
  // Горби: центри й радіуси в нормалізованих координатах; нижня частина пласка.
  const lobes = Array.from({ length: 7 }, () => ({
    x: (random() - 0.5) * 1.15,
    y: -0.05 - random() * 0.38,
    r: 0.2 + random() * 0.26,
  }));
  const density = new Float32Array(CLOUD_W * CLOUD_H);
  for (let py = 0; py < CLOUD_H; py++) {
    for (let px = 0; px < CLOUD_W; px++) {
      const u = (px / CLOUD_W - 0.5) * 2;
      const v = (py / CLOUD_H - 0.5) * 2;
      let shape = 0;
      for (const lobe of lobes) {
        const dx = (u - lobe.x) / lobe.r;
        const dy = (v - lobe.y) / (lobe.r * 1.15);
        shape = Math.max(shape, 1 - (dx * dx + dy * dy));
      }
      // Плоске дно: різко обрізаємо знизу, трохи розмиваючи.
      shape *= smoothstep(0.62, 0.34, v);
      const n = noise(u * 2.2 + seed, v * 2.2);
      density[py * CLOUD_W + px] = shape * 1.0 + (n - 0.88) * 0.95;
    }
  }
  const image = ctx.createImageData(CLOUD_W, CLOUD_H);
  const at = (x: number, y: number) => density[Math.min(CLOUD_H - 1, Math.max(0, y)) * CLOUD_W + Math.min(CLOUD_W - 1, Math.max(0, x))];
  for (let py = 0; py < CLOUD_H; py++) {
    for (let px = 0; px < CLOUD_W; px++) {
      const d = density[py * CLOUD_W + px];
      const alpha = smoothstep(0.22, 0.62, d);
      if (!(alpha > 0)) continue;
      // Світло зверху ліворуч: якщо в бік світла щільність більша, ця точка в тіні.
      const lit = at(px - 10, py - 14);
      const lit2 = at(px - 22, py - 30);
      const occlusion = Math.min(1, Math.max(0, (lit - d) * 2.4 + (lit2 - d) * 1.4));
      const light = 1 - occlusion * 0.8;
      const v = py / CLOUD_H;
      const low = smoothstep(0.35, 0.8, v) * 0.3;
      const k = Math.max(0.25, light - low);
      // Тінь холодна блакитно-сіра, світло тепло-біле.
      const r = 112 + (252 - 112) * k;
      const g = 132 + (253 - 132) * k;
      const b = 168 + (255 - 168) * k;
      const index = (py * CLOUD_W + px) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, ox, oy);
};

const clouds = () => {
  const canvas = createCanvas(CLOUD_W * COLS, CLOUD_H * ROWS);
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < COLS * ROWS; i++) cloud(ctx, (i % COLS) * CLOUD_W, Math.floor(i / COLS) * CLOUD_H, 11 + i * 29);
  return canvas.encode("webp", 82);
};

const main = async () => {
  const [spaceImage, cloudImage] = await Promise.all([space(), clouds()]);
  writeFileSync(resolve(outDir, "space.webp"), spaceImage);
  writeFileSync(resolve(outDir, "clouds.webp"), cloudImage);
  console.log(`space.webp ${(spaceImage.length / 1024).toFixed(0)} КБ, clouds.webp ${(cloudImage.length / 1024).toFixed(0)} КБ`);
};

void main();
