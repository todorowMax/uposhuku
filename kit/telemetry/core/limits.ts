// kit/telemetry/core/limits.ts
//
// Прості лічильники в базі, а не в пам'яті воркера: воркерів багато, і
// кожен рахував би окремо.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Зараховує `n` звернень у поточному вікні й каже, чи ще в межах.
 * Один запит до бази: вставка або +n.
 */
export const hit = async (db: D1Database, key: string, windowMs: number, max: number, n = 1, now = Date.now()): Promise<boolean> => {
  const window = Math.floor(now / windowMs);
  const row = await db
    .prepare(
      "INSERT INTO kit_limits (key, window, count, updated_at) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT (key, window) DO UPDATE SET count = count + ?3, updated_at = ?4 RETURNING count"
    )
    .bind(key, window, n, now)
    .first<{ count: number }>();
  return (row?.count ?? n) <= max;
};
