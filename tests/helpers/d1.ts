// tests/helpers/d1.ts
//
// Справжні D1 і R2 у пам'яті для тестів репозиторіїв: wrangler піднімає miniflare,
// ми накочуємо міграції з db/migrations. Кожен тестовий файл викликає
// `useTestD1()` один раз у beforeAll і `close()` в afterAll.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";

const applyMigrations = async (db: D1Database, dir: string) => {
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    // drizzle розділяє запити маркером, власні міграції kit мають по одному-два запити, розділених «;».
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      for (const part of statement.split(/;\s*\n/)) {
        if (part.trim()) await db.prepare(part).run();
      }
    }
  }
};

export const useTestD1 = async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database; UPLOADS: R2Bucket; TELEMETRY_DB: D1Database }>({ environment: "development", persist: false });
  const db = proxy.env.DB;
  await applyMigrations(db, join(process.cwd(), "db/migrations"));
  // Телеметрія живе в окремій базі зі своїми міграціями (kit/telemetry).
  await applyMigrations(proxy.env.TELEMETRY_DB, join(process.cwd(), "kit/telemetry/migrations"));
  (globalThis as { __TEST_D1?: D1Database }).__TEST_D1 = db;
  (globalThis as { __TEST_TELEMETRY_D1?: D1Database }).__TEST_TELEMETRY_D1 = proxy.env.TELEMETRY_DB;
  (globalThis as { __TEST_R2?: R2Bucket }).__TEST_R2 = proxy.env.UPLOADS;
  return { db, telemetry: proxy.env.TELEMETRY_DB, close: () => proxy.dispose() };
};

/** Сторонній користувач для зовнішніх ключів: id → рядок у users. */
export const makeUser = async (db: D1Database, id: string, email = `${id}@example.com`) => {
  await db.prepare("insert or ignore into users (id, email, created_at) values (?, ?, ?)").bind(id, email, Date.now()).run();
  return id;
};
