// Чого не вистачає cron-виклику /api/internal/tick: імена змінних, без значень. Порожній список означає, що можна викликати.
export const missingTickConfig = (env: { INTERNAL_TOKEN?: string; SITE_URL?: string }): string[] =>
  [env.INTERNAL_TOKEN ? null : "INTERNAL_TOKEN", (env.SITE_URL ?? "").trim() ? null : "SITE_URL"].filter((name): name is string => name !== null);
