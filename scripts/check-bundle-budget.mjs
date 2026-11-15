// scripts/check-bundle-budget.mjs
//
// Порівнює first-load JS кожного маршруту зі стелею з scripts/bundle-budget.json. Запуск після `npx next build`:
// npm run budget. Падає, коли маршрут перевищив стелю або маршруту зі стелі більше немає в збірці.

import { readFileSync } from "node:fs";

const statsPath = ".next/diagnostics/route-bundle-stats.json";
const { budgets } = JSON.parse(readFileSync(new URL("./bundle-budget.json", import.meta.url), "utf8"));

let stats;
try {
  stats = JSON.parse(readFileSync(statsPath, "utf8"));
} catch {
  console.error(`budget: немає ${statsPath}. Спершу запустіть \`npx next build\`.`);
  process.exit(1);
}

const bytesByRoute = new Map(stats.map((item) => [item.route, item.firstLoadUncompressedJsBytes]));
const format = (bytes) => bytes.toLocaleString("en-US").replace(/,/g, " ");
let failed = false;

for (const [route, budget] of Object.entries(budgets)) {
  const bytes = bytesByRoute.get(route);
  if (bytes === undefined) {
    console.error(`budget: маршруту ${route} немає в збірці; оновіть scripts/bundle-budget.json`);
    failed = true;
    continue;
  }
  const over = bytes > budget;
  console.log(`${over ? "FAIL" : "ok  "} ${route}: ${format(bytes)} з ${format(budget)}`);
  if (over) failed = true;
}

process.exit(failed ? 1 : 0);
