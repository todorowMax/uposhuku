// tests/unit/migration-0029-request-files.test.ts
//
// Міграція 0029 пересоздає request_files. Старі рядки (лише ім'я, розмір, тип) мають перейти з порожніми
// key, uploader_user_id і created_at, а не з назвами цих колонок: у SQLite слово в подвійних лапках, якого
// немає в таблиці, читається як рядок.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

const DIR = join(process.cwd(), "db/migrations");

const apply = async (db: D1Database, files: string[]) => {
  for (const file of files) {
    for (const statement of readFileSync(join(DIR, file), "utf8").split("--> statement-breakpoint")) {
      for (const part of statement.split(/;\s*\n/)) {
        if (part.trim()) await db.prepare(part).run();
      }
    }
  }
};

describe("міграція 0029: request_files", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ DB: D1Database }>({ environment: "development", persist: false });
  });
  afterAll(() => proxy.dispose());

  it("старий рядок без файла лишається, нові колонки порожні", async () => {
    const db = proxy.env.DB;
    const files = readdirSync(DIR).filter((name) => name.endsWith(".sql")).sort();
    const index = files.findIndex((name) => name.startsWith("0029_"));
    expect(index).toBeGreaterThan(0);
    await apply(db, files.slice(0, index));
    await db.prepare("insert into users (id, email, created_at) values ('u1', 'u1@example.com', 1)").run();
    await db.prepare("insert into requests (id, user_id, text, created_at) values ('r1', 'u1', 'Потрібен сайт', 1)").run();
    await db.prepare("insert into request_files (request_id, name, size, type) values ('r1', 'a.txt', 10, 'text/plain')").run();
    await apply(db, [files[index]]);
    const row = await db.prepare("select name, size, type, key, uploader_user_id, created_at from request_files").first();
    expect(row).toEqual({ name: "a.txt", size: 10, type: "text/plain", key: null, uploader_user_id: null, created_at: null });
  }, 60_000);
});
