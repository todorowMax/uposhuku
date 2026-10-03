// scripts/build-faces.ts
//
// Нарізає атлас облич 4×4 (public/map/mock-avatars.png) на 16 окремих
// квадратних JPEG у public/map/faces. Це фото демо-виконавців: у базі вони
// лежать як звичайне фото профілю (адреса /map/faces/face-NN.jpg).
//
// Запуск: npm run map:faces

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const SIDE = 256;

const main = async () => {
  const atlas = await loadImage(resolve(root, "public/map/mock-avatars.png"));
  const outDir = resolve(root, "public/map/faces");
  mkdirSync(outDir, { recursive: true });
  const cell = atlas.width / 4;
  for (let index = 0; index < 16; index++) {
    const canvas = createCanvas(SIDE, SIDE);
    canvas.getContext("2d").drawImage(atlas, (index % 4) * cell, Math.floor(index / 4) * cell, cell, cell, 0, 0, SIDE, SIDE);
    writeFileSync(resolve(outDir, `face-${String(index).padStart(2, "0")}.jpg`), canvas.toBuffer("image/jpeg", 82));
  }
  console.log("16 облич у public/map/faces");
};

void main();
