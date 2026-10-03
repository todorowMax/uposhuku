// tests/helpers/d1.ts
//
// Справжня D1 у пам'яті для тестів репозиторіїв: wrangler піднімає miniflare,
// ми накочуємо міграції з db/migrations. Кожен тестовий файл викликає
// `useTestD1()` один раз у beforeAll і `close()` в afterAll.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";

export const useTestD1 = async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ environment: "development", persist: false });
  const db = proxy.env.DB;
  const dir = join(process.cwd(), "db/migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
  (globalThis as { __TEST_D1?: D1Database }).__TEST_D1 = db;
  return { db, close: () => proxy.dispose() };
};

/** Сторонній користувач для зовнішніх ключів: id → рядок у users. */
export const makeUser = async (db: D1Database, id: string, email = `${id}@example.com`) => {
  await db.prepare("insert or ignore into users (id, email, created_at) values (?, ?, ?)").bind(id, email, Date.now()).run();
  return id;
};
