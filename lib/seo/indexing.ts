// lib/seo/indexing.ts
//
// Один перемикач індексації для всього сайту. Раніше «закрито» стояло в трьох місцях (robots.txt, meta robots
// у кореневому layout, заголовок X-Robots-Tag у воркері) і діяло на всіх середовищах; тепер усі три читають звідси.
// Відкрито лише на проді й лише коли власник поставив SEO_INDEXING=on. Типово закрито всюди:
// dev (dev.findlyfy.com) лишається закритим при будь-якому значенні змінної.

export interface IndexingEnv {
  DEPLOY_ENV?: string;
  SEO_INDEXING?: string;
}

export const indexingOpen = (env: IndexingEnv): boolean =>
  env.DEPLOY_ENV === "production" &&
  env.SEO_INDEXING?.trim().toLowerCase() === "on";

/** Значення `robots` для metadata Next: `undefined`, коли індекс відкрито (далі вирішують сторінки), інакше повна заборона. */
export const robotsMeta = (
  env: IndexingEnv,
): { index: false; follow: false } | undefined =>
  indexingOpen(env) ? undefined : { index: false, follow: false };

/** Заголовок X-Robots-Tag; `null` (не ставити), коли індекс відкрито, щоб не перекрити noindex окремих сторінок. */
export const robotsHeader = (env: IndexingEnv): string | null =>
  indexingOpen(env) ? null : "noindex, nofollow";
