// scripts/strip-prod-assets.mjs
//
// Вирізає демо-обличчя з артефакту збірки перед прод-деплоєм: `.open-next/assets/map/faces`.
// Фото демо-виконавців (public/map/faces) потрібні лише на dev. `opennextjs-cloudflare deploy` не збирає
// ассети заново з public: він заливає те, що вже лежить у `.open-next/assets`, тому вирізати можна саме тут.
//
// Після прод-деплоя каталог у `.open-next` відсутній. Перед dev-деплоєм знову `npm run cf:build`.
//
// Запуск: вбудовано в `npm run cf:deploy:production`. Окремо: node scripts/strip-prod-assets.mjs

import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEMO_FACES_SUBDIR = join("map", "faces");

// Видаляє демо-обличчя з каталогу ассетів і повертає шлях, який перевірили. Відсутній каталог не помилка.
export const stripDemoFaces = async (assetsDir) => {
  const target = join(assetsDir, DEMO_FACES_SUBDIR);
  await rm(target, { recursive: true, force: true });
  return target;
};

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const target = await stripDemoFaces(join(root, ".open-next", "assets"));
  console.log(`Прод: вирізано демо-обличчя (${target}), якщо вони були в збірці.`);
}
