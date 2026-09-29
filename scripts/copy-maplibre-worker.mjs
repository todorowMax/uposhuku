// scripts/copy-maplibre-worker.mjs
//
// MapLibre 6 вантажить обробку тайлів в окремому воркері: це ES-модуль
// поруч із бібліотекою. Після збірки Next.js ці файли губляться, тож
// копіюємо їх у public/maplibre і вказуємо шлях через setWorkerUrl.
// Запускається перед dev і build; результат у .gitignore.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "node_modules/maplibre-gl/dist");
const to = resolve(root, "public/maplibre");

mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(resolve(from, file), resolve(to, file));
}
console.log("  maplibre worker → public/maplibre");
