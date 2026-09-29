// scripts/build-cloud-assets.ts
//
// Хмари по краях глобуса. Джерело: генерація в Artist, білі купчасті
// хмари з боків на блакитному небі. Небо нам не потрібне: сторінка
// світла, і хмари мають лежати просто на ній і на глобусі. Тому
// «розмішуємо» кожен піксель назад на хмару й небо та зберігаємо лише
// хмару з прозорістю.
//
// Модель пікселя: P = a·g + (1 − a)·S, де S колір неба в цій точці,
// g яскравість хмари (хмара нейтрально-сіра, від білої до тіні), a її
// непрозорість. Небо відоме, у трьох каналах три рівняння на два
// невідомих, розв'язуємо найменшими квадратами. Небо блакитне, канали
// в нього дуже різні, тож система добре обумовлена.
//
// Запуск: npm run clouds:assets -- <шлях до зображення>
// (за замовчуванням assets/artist/clouds-sides.jpg)

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, process.argv[2] ?? "assets/artist/clouds-sides.jpg");
const outDir = resolve(root, "public/globe");

/** Відтінок хмар: трохи холодніші за чистий білий, як тіні на макеті. */
const CLOUD_TINT: [number, number, number] = [0.975, 0.985, 1];
/**
 * Наскільки поглибити тіні всередині хмари. На світлій сторінці біла
 * хмара без тіней зливається з тлом, об'єм читається саме з них.
 */
const SHADOW_DEPTH = 1.7;

/**
 * Небо як гладка функція від координат: квадратичний поліном по x і y
 * для кожного каналу, підігнаний за пікселями, які точно небо.
 */
const fitSky = (data: Uint8ClampedArray, width: number, height: number) => {
  const terms = (x: number, y: number) => [1, x, y, x * x, x * y, y * y];
  const n = 6;
  const ata = Array.from({ length: n }, () => new Float64Array(n));
  const atb = [0, 1, 2].map(() => new Float64Array(n));
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // Небо: синій помітно більший за червоний. Хмари майже нейтральні.
      if (b - r < 70) continue;
      const t = terms(x / width, y / height);
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) ata[j][k] += t[j] * t[k];
        atb[0][j] += t[j] * r;
        atb[1][j] += t[j] * g;
        atb[2][j] += t[j] * b;
      }
    }
  }
  const solve = (matrix: Float64Array[], vector: Float64Array) => {
    const m = matrix.map((row, i) => [...row, vector[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
      }
      [m[col], m[pivot]] = [m[pivot], m[col]];
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = m[row][col] / m[col][col];
        for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
      }
    }
    return m.map((row, i) => row[n] / row[i]);
  };
  const coefficients = atb.map((vector) => solve(ata, vector));
  return (x: number, y: number) => {
    const t = terms(x / width, y / height);
    return coefficients.map((c) => c.reduce((sum, value, j) => sum + value * t[j], 0));
  };
};

const main = async () => {
  const image = await loadImage(source);
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  const sky = fitSky(data, width, height);

  const out = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const s = sky(x, y);
      // P_c − S_c = u − a·S_c, де u = a·g. Найменші квадрати по трьох каналах.
      let sumS = 0;
      let sumSS = 0;
      let sumD = 0;
      let sumSD = 0;
      for (let c = 0; c < 3; c++) {
        const d = data[i + c] - s[c];
        sumS += s[c];
        sumSS += s[c] * s[c];
        sumD += d;
        sumSD += s[c] * d;
      }
      // Нормальні рівняння для [u, a] з рядками [1, −S_c].
      const det = 3 * sumSS - sumS * sumS;
      const u = (sumSS * sumD - sumS * sumSD) / det;
      const a = Math.max(0, Math.min(1, (sumS * sumD - 3 * sumSD) / det));
      const lit = a > 0.02 ? Math.max(0, Math.min(255, u / a)) : 255;
      // На прозорих краях оцінка яскравості ненадійна, і поглиблена тінь
      // лягає брудною сірою облямівкою. Тінь проявляємо лише в щільній хмарі.
      const density = Math.max(0, Math.min(1, (a - 0.15) / 0.45));
      const gray = Math.max(0, 255 - (255 - lit) * SHADOW_DEPTH * density * density);
      out.data[i] = gray * CLOUD_TINT[0];
      out.data[i + 1] = gray * CLOUD_TINT[1];
      out.data[i + 2] = gray * CLOUD_TINT[2];
      // Тонкий серпанок неба лишаємо прозорим: інакше вся латка ляже
      // на сторінку блідою плямою з прямими краями.
      out.data[i + 3] = 255 * Math.max(0, Math.min(1, (a - 0.06) / 0.94));
    }
  }
  ctx.putImageData(out, 0, 0);

  // Ліва й права хмари окремо: кожна кріпиться до свого краю екрана.
  mkdirSync(outDir, { recursive: true });
  const half = Math.round(width * 0.42);
  for (const [name, offset] of [
    ["clouds-left.webp", 0],
    ["clouds-right.webp", width - half],
  ] as const) {
    const part = createCanvas(half, height);
    part.getContext("2d").drawImage(canvas, offset, 0, half, height, 0, 0, half, height);
    const bytes = await part.encode("webp", 88);
    writeFileSync(resolve(outDir, name), bytes);
    console.log(`  ${name}: ${half}×${height}, ${(bytes.length / 1024).toFixed(0)} КБ`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
