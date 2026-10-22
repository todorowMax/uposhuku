// kit/telemetry/core/reports.ts
//
// SQL готових звітів. Чисті функції, що повертають рядок запиту: їх запускає
// і скрипт `npm run tel` (через wrangler), і майбутня адмінка, і тести на
// справжній D1. Час у базі UTC (мілісекунди); у виводі переводимо у Київ.

const DAY = 86_400_000;

/** Рядок для SQL у лапках. Імена подій і відбитки в нас латиницею, але екрануємо все одно. */
export const sqlString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const since = (days: number, now: number) => Math.round(now - Math.max(1, Math.floor(days)) * DAY);

/** Час у Києві. Літом +3, взимку +2: SQLite без бази часових поясів, тому беремо поточне зміщення. */
export const KYIV_OFFSET_HOURS = (now = Date.now()): number => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Kyiv", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const kyivHour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const utcHour = new Date(now).getUTCHours();
  return (kyivHour - utcHour + 24) % 24;
};

const localTime = (column: string, now: number) => `datetime(${column}/1000, 'unixepoch', '+${KYIV_OFFSET_HOURS(now)} hours')`;

/** Відкриті групи помилок, свіжі першими. */
export const errorsSql = (now = Date.now(), limit = 20): string =>
  `SELECT ${localTime("last_seen", now)} AS last_seen, count, level, event, substr(message, 1, 100) AS message, last_release AS release, fingerprint ` +
  `FROM log_issues WHERE status = 'open' ORDER BY last_seen DESC LIMIT ${Math.max(1, Math.floor(limit))}`;

/** Останні випадки однієї групи з подробицями. */
export const issueSql = (fingerprint: string, now = Date.now(), limit = 5): string =>
  `SELECT ${localTime("created_at", now)} AS at, route, release, country, user_id, detail FROM logs WHERE fingerprint = ${sqlString(fingerprint)} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.floor(limit))}`;

/** Скільки разів кожна подія за період, без своїх сесій. */
export const eventsSql = (days = 7, now = Date.now()): string =>
  `SELECT name, COUNT(*) AS events, COUNT(DISTINCT COALESCE(user_id, anon_id, session_id)) AS people, source FROM events ` +
  `WHERE ts >= ${since(days, now)} AND internal = 0 GROUP BY name, source ORDER BY events DESC`;

/** Люди за днями: хто хоч раз щось зробив. */
export const dailySql = (days = 14, now = Date.now()): string =>
  `SELECT date(${localTime("ts", now)}) AS day, COUNT(DISTINCT COALESCE(user_id, anon_id, session_id)) AS people, COUNT(*) AS events ` +
  `FROM events WHERE ts >= ${since(days, now)} AND internal = 0 GROUP BY day ORDER BY day DESC`;

/**
 * Скільки людей дійшло до кожного кроку. Не сувора послідовність (людина
 * могла пропустити крок, або подія не дійшла від блокувальника), а охоплення:
 * для старту воно відповідає на «де відвалюються» не гірше.
 */
export const funnelSql = (steps: string[], days = 30, now = Date.now()): string => {
  if (steps.length === 0) throw new Error("Порожня воронка");
  const values = steps.map((name, index) => `(${index + 1}, ${sqlString(name)})`).join(", ");
  // Кроки як VALUES, а не UNION ALL: D1 дозволяє лише кілька доданків у складеному SELECT.
  return (
    `WITH steps(step, event) AS (VALUES ${values}) ` +
    `SELECT s.step AS step, s.event AS event, COUNT(DISTINCT COALESCE(e.user_id, e.anon_id, e.session_id)) AS people ` +
    `FROM steps s LEFT JOIN events e ON e.name = s.event AND e.ts >= ${since(days, now)} AND e.internal = 0 ` +
    `GROUP BY s.step, s.event ORDER BY s.step`
  );
};

/** Усі запити звітів для kit, щоб тест міг прогнати кожен на справжній базі. */
export const allReportQueries = (now = Date.now()): Record<string, string> => ({
  errors: errorsSql(now),
  issue: issueSql("0000000000000000", now),
  events: eventsSql(7, now),
  daily: dailySql(14, now),
  funnel: funnelSql(["page_view", "map_ready"], 30, now),
});
