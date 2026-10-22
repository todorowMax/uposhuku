// kit/telemetry/core/types.ts
//
// Спільні типи ядра. Ядро не знає ні про React, ні про Next, ні про сам
// застосунок: усе, що від нього потрібно, приходить у `KitServerConfig`.

export type LogLevel = "error" | "warn" | "info";
export type LogSource = "client" | "server" | "worker";

export interface KitServerConfig {
  /** Назва застосунку: "uposhuku". Потрібна, коли кілька застосунків пишуть в одну базу. */
  app: string;
  /** Середовище: "development" | "production". */
  env: string;
  /** Версія збірки (git sha). */
  release?: string;
  /** База телеметрії. `null` — телеметрія вимкнена, усе мовчки нічого не робить. */
  db(): D1Database | null;
  /** Хто увійшов. Клієнтові про це не віримо: id береться лише із сесії. */
  userId(): Promise<string | null>;
  /** Сіль для хешу IP. Застосунок дає свій секрет. */
  salt: string;
  /** Дозволені назви подій. Немає — дозволено будь-яку коректну назву. */
  allowedEvents?: ReadonlySet<string>;
  /** Дописати роботу після відповіді (`ctx.waitUntil`). */
  waitUntil?(work: Promise<unknown>): void;
}

export interface LogInput {
  level: LogLevel;
  source: LogSource;
  /** Короткий код: за ним шукаємо однотипні випадки. */
  event: string;
  message?: string;
  /** Будь-що корисне для розбору, серіалізується в JSON. */
  detail?: unknown;
  /** Стек, якщо є: з нього рахується fingerprint. Інакше береться `detail.stack`. */
  stack?: string | null;
  /** Свій fingerprint замість обчисленого. */
  fingerprint?: string;
  userId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
  ipHash?: string | null;
  route?: string | null;
  userAgent?: string | null;
  country?: string | null;
  /** Скільки місця дозволено для detail (до жорсткої межі). */
  detailMax?: number;
}

export type PropValue = string | number | boolean;
export type EventProps = Record<string, PropValue>;

export interface EventRow {
  id: string;
  ts: number;
  name: string;
  props: EventProps | null;
  source: "client" | "server";
  userId: string | null;
  anonId: string | null;
  sessionId: string;
  path: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  internal: boolean;
}
