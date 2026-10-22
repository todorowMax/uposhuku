// scripts/telemetry.ts
//
// Звіти з телеметрії, доки немає адмінки: помилки, події, люди за днями,
// воронки. Читає TELEMETRY_DB через wrangler і друкує таблицю.
//
//   npm run tel -- errors --env production
//   npm run tel -- issue <fingerprint> --env production
//   npm run tel -- events --env development --days 7
//   npm run tel -- daily --env production --days 14
//   npm run tel -- funnel-customer --env production --days 30
//   npm run tel -- funnel-performer --env production
//   npm run tel -- tags --env production --days 30     (див. docs/telemetry.md)
//   --local читає локальну базу замість віддаленої.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dailySql, errorsSql, eventsSql, issueSql } from "../kit/telemetry/core";
import { customerFunnelSql, performerFunnelSql } from "../lib/telemetry/reports";
import { tagsReport } from "../lib/telemetry/tags-report";

const [report, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : undefined;
};
const env = flag("env") ?? "development";
const local = rest.includes("--local");
const days = Number(flag("days") ?? 0) || undefined;
const positional = rest.filter((item, index) => !item.startsWith("--") && !rest[index - 1]?.startsWith("--"));

if (!["development", "production"].includes(env)) {
  console.error("--env: development або production");
  process.exit(1);
}

const run = (binding: "TELEMETRY_DB" | "DB") => (sql: string): Record<string, unknown>[] => {
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", binding, "--env", env, local ? "--local" : "--remote", "--json", "--command", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw.slice(raw.indexOf("["))) as { results: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
};
const query = run("TELEMETRY_DB");

const print = (title: string, rows: Record<string, unknown>[]) => {
  console.log(`\n${title}`);
  if (rows.length === 0) console.log("(порожньо)");
  else console.table(rows);
};

switch (report) {
  case "errors":
    print("Відкриті групи помилок", query(errorsSql()));
    break;
  case "issue": {
    const fingerprint = positional[0];
    if (!fingerprint) throw new Error("Вкажіть fingerprint: npm run tel -- issue <fingerprint>");
    print(`Останні випадки ${fingerprint}`, query(issueSql(fingerprint)));
    break;
  }
  case "events":
    print(`Події за ${days ?? 7} дн.`, query(eventsSql(days ?? 7)));
    break;
  case "daily":
    print(`Люди за днями (${days ?? 14} дн.)`, query(dailySql(days ?? 14)));
    break;
  case "funnel-customer":
    print(`Воронка замовника (${days ?? 30} дн.)`, query(customerFunnelSql(days ?? 30)));
    break;
  case "funnel-performer":
    print(`Воронка виконавця (${days ?? 30} дн.)`, query(performerFunnelSql(days ?? 30)));
    break;
  case "tags": {
    const markdown = tagsReport({ telemetry: query, main: run("DB") }, days ?? 30);
    console.log(markdown);
    const dir = resolve(__dirname, "../.cache");
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `tags-report-${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(file, markdown);
    console.log(`\nЗбережено: ${file}`);
    break;
  }
  default:
    console.error("Звіти: errors | issue <fp> | events | daily | funnel-customer | funnel-performer | tags. Прапорці: --env, --days, --local");
    process.exit(1);
}
