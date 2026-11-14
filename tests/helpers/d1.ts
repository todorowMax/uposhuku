// tests/helpers/d1.ts
//
// Справжні D1 і R2 у пам'яті для тестів репозиторіїв: wrangler піднімає miniflare,
// ми накочуємо міграції з db/migrations. Кожен тестовий файл викликає
// `useTestD1()` один раз у beforeAll і `close()` в afterAll.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { profiles, profileTags, projectTags, projects } from "@/db/schema";
import type { Profile } from "@/lib/profile/types";
import { getDb } from "@/lib/server/db";

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

/** Рядки частинами так, щоб у запиті було не більше 100 параметрів (межа D1). */
export const rowChunks = <T>(rows: T[], paramsPerRow: number): T[][] => {
  const size = Math.max(1, Math.floor(100 / paramsPerRow));
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
};

/** Багато користувачів із прийнятими умовами кількома багаторядковими вставками в одному пакеті: для тестів великих обсягів, де послідовні записи надто повільні. */
export const makeUsers = async (db: D1Database, ids: string[], createdAt = Date.now()) => {
  const { LEGAL_VERSIONS } = await import("@/lib/legal/config");
  const userChunks = rowChunks(ids, 3).map((chunk) => db.prepare(`insert or ignore into users (id, email, created_at) values ${chunk.map(() => "(?, ?, ?)").join(", ")}`).bind(...chunk.flatMap((id) => [id, `${id}@example.com`, createdAt])));
  const accepted = ids.flatMap((id) => ACCEPTED_DOCS.map((doc) => [`${id}:${doc}`, id, doc, LEGAL_VERSIONS[doc], createdAt]));
  const acceptChunks = rowChunks(accepted, 5).map((chunk) => db.prepare(`insert or ignore into legal_acceptances (id, user_id, doc, version, accepted_at, source) values ${chunk.map(() => "(?, ?, ?, ?, ?, 'signup')").join(", ")}`).bind(...chunk.flat()));
  await db.batch([...userChunks, ...acceptChunks]);
};

/**
 * Профілі з тегами й роботами багаторядковими вставками в одному пакеті, без `saveProfile` (він робить кілька запитів на людину).
 * Для тестів великих обсягів, які перевіряють читання. Число параметрів на рядок дорівнює числу колонок таблиці: drizzle підставляє й значення за замовчуванням.
 */
export const seedProfiles = async (items: { userId: string; profile: Profile }[]) => {
  const db = getDb();
  const now = Date.now();
  const tagSource = (tagId: string, manualTags: string[]) => (manualTags.includes(tagId) ? ("manual" as const) : ("auto" as const));
  const seed = [
    ...rowChunks(items, 10).map((chunk) =>
      db.insert(profiles).values(chunk.map(({ userId, profile }) => ({ userId, name: profile.name, cityId: profile.cityId, lat: profile.location?.lat ?? null, lng: profile.location?.lng ?? null, specialty: profile.specialty, bio: profile.bio, photo: profile.photo, published: profile.published, updatedAt: now }))),
    ),
    ...rowChunks(items.flatMap(({ userId, profile }) => profile.tags.map((tagId) => ({ userId, tagId, source: tagSource(tagId, profile.manualTags) }))), 3).map((chunk) => db.insert(profileTags).values(chunk)),
    ...rowChunks(items.flatMap(({ userId, profile }) => profile.works.map((work, position) => ({ id: `${userId}:${work.id}`, userId, position, title: work.title, description: work.description, url: work.url }))), 6).map((chunk) => db.insert(projects).values(chunk)),
    ...rowChunks(items.flatMap(({ userId, profile }) => profile.works.flatMap((work) => work.tags.map((tagId) => ({ projectId: `${userId}:${work.id}`, tagId, source: tagSource(tagId, work.manualTags) })))), 3).map((chunk) => db.insert(projectTags).values(chunk)),
  ];
  if (seed.length) await db.batch(seed as [(typeof seed)[number], ...(typeof seed)[number][]]);
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
