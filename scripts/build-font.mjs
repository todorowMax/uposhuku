// scripts/build-font.mjs
//
// Збирає public/fonts/FixelVariable.woff2 з повного design/fonts/FixelVariable.ttf:
// лишає кирилицю (з ґ, є, і, ї, ʼ), латиницю та знаки інтерфейсу, осі wght і wdth
// та OpenType-можливості зберігає. Потрібні Python 3 і пакети fonttools та brotli
// (python3 -m pip install fonttools brotli). Запуск: npm run font:build

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unicodes = [
  "U+0020-007E", // базова латиниця
  "U+00A0-00FF", // латиниця-1: « » № знаки, ·
  "U+0131,U+0152-0153,U+02BC,U+02C6,U+02DC", // ʼ апостроф та діакритика
  "U+0300-0308", // комбіновані наголоси
  "U+0400-045F,U+0490-0491", // кирилиця, ґ Ґ є Є і І ї Ї
  "U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A", // тире, лапки, крапки
  "U+20AC,U+20B4,U+2116,U+2122", // € ₴ № ™
  "U+2190-2193,U+2212,U+2248,U+2260,U+2264-2265", // стрілки, мінус, порівняння
].join(",");

mkdirSync(resolve(root, "public/fonts"), { recursive: true });
execFileSync(
  "pyftsubset",
  [
    resolve(root, "design/fonts/FixelVariable.ttf"),
    `--unicodes=${unicodes}`,
    "--flavor=woff2",
    "--layout-features=*",
    "--no-hinting",
    `--output-file=${resolve(root, "public/fonts/FixelVariable.woff2")}`,
  ],
  { stdio: "inherit" },
);
console.log("public/fonts/FixelVariable.woff2");
