// kit/telemetry/core/log.ts
//
// Журнал помилок: рядок у `logs` і група в `log_issues`. Своє, а не
// Sentry: база вже є, а сторонній сервіс заради застосунку з десятком
// користувачів зарано. Усе, що пишемо, це рівень, короткий код і JSON, тож
// піти в справжній збирач потім легко.

import { fingerprint as computeFingerprint } from "./fingerprint";
import { DAY } from "./limits";
import { clip, serialize } from "./serialize";
import type { KitServerConfig, LogInput } from "./types";

const MESSAGE_MAX = 500;
const PRUNE_CHANCE = 0.01;
export const LOG_RETENTION_MS = 30 * DAY;
export const EVENT_RETENTION_MS = 180 * DAY;

const stackOf = (input: LogInput): string | null => {
  if (input.stack) return input.stack;
  const detail = input.detail;
  if (detail instanceof Error) return detail.stack ?? null;
  if (detail && typeof detail === "object" && "stack" in detail) {
    const stack = (detail as { stack?: unknown }).stack;
    return typeof stack === "string" ? stack : null;
  }
  return null;
};

/** Прибирає старе. Викликається зрідка з місця, яке й так пише. Не кидає. */
export const pruneTelemetry = async (db: D1Database, now = Date.now()): Promise<void> => {
  try {
    await db.batch([
      db.prepare("DELETE FROM logs WHERE created_at < ?").bind(now - LOG_RETENTION_MS),
      db.prepare("DELETE FROM events WHERE received_at < ?").bind(now - EVENT_RETENTION_MS),
      db.prepare("DELETE FROM kit_limits WHERE updated_at < ?").bind(now - DAY),
    ]);
  } catch {
    // Не прибралося, спробуємо наступного разу.
  }
};

/**
 * Запис у журнал.
 *
 * **Ніколи не кидає.** Журнал, який може зламати те, що він записує, гірший
 * за його відсутність: помилка при спробі записати помилку перетворює дрібну
 * незручність на білий екран.
 */
export const logEvent = async (config: KitServerConfig, input: LogInput): Promise<void> => {
  try {
    const db = config.db();
    if (!db) return;
    const now = Date.now();
    const event = input.event.slice(0, 64);
    const message = clip(input.message, MESSAGE_MAX) ?? "";
    const print = input.fingerprint ?? (await computeFingerprint({ source: input.source, event, message, stack: stackOf(input) }));

    const statements = [
      db
        .prepare(
          "INSERT INTO logs (id, created_at, level, source, event, message, detail, fingerprint, user_id, anon_id, session_id, ip_hash, route, release, env, user_agent, country) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          now,
          input.level,
          input.source,
          event,
          message,
          serialize(input.detail, input.detailMax),
          print,
          input.userId ?? null,
          clip(input.anonId, 64),
          clip(input.sessionId, 64),
          clip(input.ipHash, 32),
          clip(input.route, 200),
          config.release ?? null,
          config.env,
          clip(input.userAgent, 300),
          clip(input.country, 2)
        ),
    ];
    // Групуємо лише те, що вимагає уваги; info — це просто запис.
    if (input.level !== "info") {
      statements.push(
        db
          .prepare(
            "INSERT INTO log_issues (fingerprint, event, message, level, first_seen, last_seen, count, status, last_release) VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1, 'open', ?6) " +
              "ON CONFLICT (fingerprint) DO UPDATE SET last_seen = ?5, count = count + 1, last_release = ?6, " +
              // Помилка, яку вважали виправленою, повернулась: знову відкрита. «Ігнорується» лишається.
              "status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END"
          )
          .bind(print, event, message, input.level, now, config.release ?? null)
      );
    }
    await db.batch(statements);

    // Прибирання залежить не від браузерних помилок, а від будь-якого запису.
    if (Math.random() < PRUNE_CHANCE) await pruneTelemetry(db, now);
  } catch {
    // Свідомо тихо. Далі йти нема куди: якби ми вміли надійно повідомити про
    // цю помилку, ми б і початкову записали.
  }
};

/** Те саме, але не затримує відповідь: добігає після неї. */
export const logLater = (config: KitServerConfig, input: LogInput): void => {
  const work = logEvent(config, input);
  if (config.waitUntil) config.waitUntil(work);
  else void work;
};

/** Забути людину: обнуляє ідентифікатори в журналі й подіях. Для видалення акаунта. */
export const forgetUser = async (db: D1Database, userId: string): Promise<void> => {
  await db.batch([
    db.prepare("UPDATE logs SET user_id = NULL, anon_id = NULL, ip_hash = NULL WHERE user_id = ?").bind(userId),
    db.prepare("UPDATE events SET user_id = NULL, anon_id = NULL WHERE user_id = ?").bind(userId),
  ]);
};
