// kit/telemetry/core/events.ts
//
// Аналітика: події в `events`. Жодних вільних текстів, лише назва й прості
// властивості. Пишемо і з браузера (батчі через роут), і з сервера
// (`trackServer`), щоб ключові кроки не залежали від блокувальників.

import { pruneTelemetry } from "./log";
import { clip, serialize } from "./serialize";
import type { EventProps, EventRow, KitServerConfig, PropValue } from "./types";

export const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const PROP_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_PROPS = 15;
const PROP_STRING_MAX = 100;
const PRUNE_CHANCE = 0.01;

/**
 * Властивості події: до 15 ключів у snake_case, значення — короткий рядок,
 * скінченне число чи булеве. Усе інше (об'єкти, довгі тексти) відкидаємо.
 */
export const sanitizeProps = (value: unknown): EventProps | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: EventProps = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(result).length >= MAX_PROPS) break;
    if (!PROP_KEY.test(key)) continue;
    let prop: PropValue | undefined;
    if (typeof raw === "string") prop = raw.slice(0, PROP_STRING_MAX);
    else if (typeof raw === "number" && Number.isFinite(raw)) prop = raw;
    else if (typeof raw === "boolean") prop = raw;
    if (prop !== undefined) result[key] = prop;
  }
  return Object.keys(result).length ? result : null;
};

/** Адреса переходу лишається доменом: шлях нам не потрібен, а може нести зайве. */
export const refererDomain = (value: unknown): string | null => {
  const text = clip(value, 300);
  if (!text) return null;
  try {
    return new URL(text).hostname.slice(0, 100) || null;
  } catch {
    return null;
  }
};

export interface EventContext {
  release?: string;
  receivedAt?: number;
}

/** Вставка пачки; повторна відправка того самого `id` ігнорується. */
export const insertEvents = async (db: D1Database, rows: EventRow[], context: EventContext = {}): Promise<void> => {
  if (rows.length === 0) return;
  const receivedAt = context.receivedAt ?? Date.now();
  const statement = db.prepare(
    "INSERT OR IGNORE INTO events (id, ts, received_at, name, props, source, user_id, anon_id, session_id, path, referrer, utm_source, utm_medium, utm_campaign, device, browser, os, country, internal, release) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  await db.batch(
    rows.map((row) =>
      statement.bind(
        row.id,
        row.ts,
        receivedAt,
        row.name,
        row.props ? serialize(row.props, 1000) : null,
        row.source,
        row.userId,
        row.anonId,
        row.sessionId,
        row.path,
        row.referrer,
        row.utmSource,
        row.utmMedium,
        row.utmCampaign,
        row.device,
        row.browser,
        row.os,
        row.country,
        row.internal ? 1 : 0,
        context.release ?? null
      )
    )
  );
  if (Math.random() < PRUNE_CHANCE) await pruneTelemetry(db, receivedAt);
};

/**
 * Серверна подія: для кроків, які не має права загубити блокувальник
 * реклами. Не кидає й не затримує відповідь.
 */
export const trackServer = (config: KitServerConfig, name: string, props?: Record<string, unknown>, options: { userId?: string | null; path?: string | null } = {}): void => {
  const work = (async () => {
    try {
      const db = config.db();
      if (!db || !EVENT_NAME.test(name)) return;
      if (config.allowedEvents && !config.allowedEvents.has(name)) return;
      const now = Date.now();
      await insertEvents(
        db,
        [
          {
            id: crypto.randomUUID(),
            ts: now,
            name,
            props: sanitizeProps(props),
            source: "server",
            userId: options.userId ?? null,
            anonId: null,
            sessionId: "server",
            path: clip(options.path, 200),
            referrer: null,
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            device: null,
            browser: null,
            os: null,
            country: null,
            internal: false,
          },
        ],
        { release: config.release, receivedAt: now }
      );
    } catch {
      // Аналітика не має ламати те, що вимірює.
    }
  })();
  if (config.waitUntil) config.waitUntil(work);
  else void work;
};
