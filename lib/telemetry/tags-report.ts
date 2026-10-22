// lib/telemetry/tags-report.ts
//
// Щотижневий звіт про словник тегів: чого люди шукають і не знаходять, що
// пропонують, які слова пишуть замовники, а ми не розпізнаємо, і які теги з
// тексту люди прибирають. З нього поповнюємо словник (див. docs/telemetry.md).
//
// Дані з двох баз: пропозиції й терміни лежать у головній, події в телеметрії.

type Row = Record<string, unknown>;
export type Runner = (sql: string) => Row[];

const DAY = 86_400_000;

export interface TagsReportSql {
  /** Головна база. */
  proposals: string;
  unknownTerms: string;
  /** База телеметрії. */
  emptySearches: string;
  falsePositives: string;
  rankStats: string;
  lowRank: string;
}

export const tagsReportSql = (days = 30, now = Date.now()): TagsReportSql => {
  const since = Math.round(now - Math.max(1, Math.floor(days)) * DAY);
  const base = `ts >= ${since} AND internal = 0`;
  return {
    proposals:
      "SELECT p.text AS text, COUNT(DISTINCT u.user_id) AS people, group_concat(DISTINCT u.context) AS contexts FROM tag_proposals p " +
      "JOIN tag_proposal_uses u ON u.proposal_id = p.id WHERE p.status = 'new' GROUP BY p.id ORDER BY people DESC, p.created_at ASC LIMIT 30",
    unknownTerms: "SELECT sample AS word, requests FROM tag_term_stats WHERE requests >= 3 ORDER BY requests DESC LIMIT 30",
    emptySearches:
      `SELECT json_extract(props, '$.query') AS query, COUNT(DISTINCT session_id) AS sessions, group_concat(DISTINCT json_extract(props, '$.context')) AS contexts ` +
      `FROM events WHERE name = 'tag_search_empty' AND ${base} GROUP BY query ORDER BY sessions DESC, query LIMIT 30`,
    falsePositives:
      `SELECT json_extract(props, '$.tag') AS tag, json_extract(props, '$.phrase') AS phrase, COUNT(*) AS removed FROM events ` +
      `WHERE name = 'tag_removed' AND json_extract(props, '$.source') = 'auto' AND json_extract(props, '$.phrase') IS NOT NULL AND ${base} ` +
      `GROUP BY tag, phrase ORDER BY removed DESC LIMIT 30`,
    rankStats: `SELECT ROUND(AVG(json_extract(props, '$.rank')), 2) AS avg_rank, COUNT(*) AS picks FROM events WHERE name = 'tag_picked' AND ${base}`,
    lowRank:
      `SELECT json_extract(props, '$.tag') AS tag, ROUND(AVG(json_extract(props, '$.rank')), 1) AS avg_rank, COUNT(*) AS picks FROM events ` +
      `WHERE name = 'tag_picked' AND json_extract(props, '$.rank') >= 5 AND ${base} GROUP BY tag ORDER BY picks DESC LIMIT 20`,
  };
};

const table = (rows: Row[], columns: [key: string, title: string][]): string => {
  if (rows.length === 0) return "_Порожньо._\n";
  const head = `| ${columns.map(([, title]) => title).join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map(([key]) => String(row[key] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`).join("\n");
  return `${head}\n${body}\n`;
};

/** Звіт у markdown. `main` і `telemetry` — виконавці запитів до відповідних баз. */
export const tagsReport = (runners: { main: Runner; telemetry: Runner }, days = 30, now = Date.now()): string => {
  const sql = tagsReportSql(days, now);
  const stats = runners.telemetry(sql.rankStats)[0];
  return [
    `# Звіт про словник тегів: ${days} дн. до ${new Date(now).toISOString().slice(0, 10)}`,
    "",
    "Як із цього поповнювати словник: `docs/telemetry.md`, розділ «Раз на тиждень».",
    "",
    "## 1. Пропозиції тегів на розгляді",
    "Людина прямо сказала, чого не вистачає. Найсильніший сигнал.",
    "",
    table(runners.main(sql.proposals), [["text", "Пропозиція"], ["people", "Людей"], ["contexts", "Де"]]),
    "## 2. Шукали й не знайшли",
    "Запити в пікері тегів без жодного результату (нормалізовані, без контактів).",
    "",
    table(runners.telemetry(sql.emptySearches), [["query", "Запит"], ["sessions", "Сесій"], ["contexts", "Де"]]),
    "## 3. Слова із запитів замовників, яких словник не знає",
    "Лише слова, що трапились у трьох і більше запитах. Лічильник без прив'язки до людей.",
    "",
    table(runners.main(sql.unknownTerms), [["word", "Слово"], ["requests", "Запитів"]]),
    "## 4. Хибні спрацювання",
    "Людина прибрала тег, який ми розпізнали з її тексту: фрагмент можна прибрати зі синонімів.",
    "",
    table(runners.telemetry(sql.falsePositives), [["tag", "Тег"], ["phrase", "Фрагмент тексту"], ["removed", "Прибрали разів"]]),
    "## 5. Якість пошуку",
    `Середнє місце вибраного тегу у видачі: ${stats?.avg_rank ?? "—"} (вибрали ${stats?.picks ?? 0} разів; 0 = перший). Теги, які вибирають з п'ятого місця й нижче:`,
    "",
    table(runners.telemetry(sql.lowRank), [["tag", "Тег"], ["avg_rank", "Середнє місце"], ["picks", "Разів"]]),
  ].join("\n");
};
