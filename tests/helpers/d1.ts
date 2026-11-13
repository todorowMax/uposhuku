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

/** Усі правові документи, які в тестах вважаються прийнятими (версії беремо з коду: нова версія не ламає тести). */
const ACCEPTED_DOCS = ["terms", "privacy", "offer", "safeDealOffer", "cryptoRisk"] as const;

const acceptAll = async (db: D1Database, userId: string, at: number) => {
  const { LEGAL_VERSIONS } = await import("@/lib/legal/config");
  const insert = db.prepare("insert or ignore into legal_acceptances (id, user_id, doc, version, accepted_at, source) values (?, ?, ?, ?, ?, 'signup')");
  await db.batch(ACCEPTED_DOCS.map((doc) => insert.bind(`${userId}:${doc}`, userId, doc, LEGAL_VERSIONS[doc], at)));
};

/**
 * Сторонній користувач для зовнішніх ключів: id → рядок у users.
 * `createdAt` за замовчуванням тепер: тести, яким потрібен «старий» акаунт (ліміт нового), передають свій.
 * `accepted: false` лишає користувача без згод: для тестів, що перевіряють відмову до прийняття умов і ризику крипти.
 */
export const makeUser = async (db: D1Database, id: string, options: { email?: string; createdAt?: number; accepted?: boolean } = {}) => {
  const { email = `${id}@example.com`, createdAt = Date.now(), accepted = true } = options;
  await db.prepare("insert or ignore into users (id, email, created_at) values (?, ?, ?)").bind(id, email, createdAt).run();
  if (accepted) await acceptAll(db, id, createdAt);
  return id;
};

/**
 * Рахує запити до D1, які зробила `run`: підміняє привʼязку на обгортку, що лічить `prepare`
 * (кожен запит drizzle, і в батчі теж, проходить через нього). Для тестів «число запитів не росте з даними».
 */
export const countD1Queries = async <T>(run: () => Promise<T>): Promise<{ result: T; queries: number }> => {
  const holder = globalThis as { __TEST_D1?: D1Database };
  const original = holder.__TEST_D1;
  if (!original) throw new Error("Спершу useTestD1()");
  let queries = 0;
  holder.__TEST_D1 = new Proxy(original, {
    get: (target, key) => {
      if (key === "prepare") return (sql: string) => (queries++, target.prepare(sql));
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  try {
    return { result: await run(), queries };
  } finally {
    holder.__TEST_D1 = original;
  }
};
