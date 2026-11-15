// lib/chat/dates.ts
//
// Дати в чаті за місцевим часом глядача (не за київським): розділювачі днів у стрічці й час у рядку списку.
// `now` передається ззовні, щоб функції лишались чистими.

const DAY = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" });
const DAY_YEAR = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
const SHORT_YEAR = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });

/** Ключ місцевого дня (рік-місяць-число): за ним групуємо стрічку. */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const daysBetween = (from: Date, to: Date): number => Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);

/** Підпис дня над повідомленнями: «Сьогодні», «Вчора», «12 листопада» (з роком, якщо рік інший). */
export const dayLabel = (iso: string, now: Date): string => {
  const date = new Date(iso);
  const ago = daysBetween(date, now);
  if (ago === 0) return "Сьогодні";
  if (ago === 1) return "Вчора";
  return (date.getFullYear() === now.getFullYear() ? DAY : DAY_YEAR).format(date);
};

export const clockTime = (iso: string): string => TIME.format(new Date(iso));

/** Час у рядку списку: сьогодні година й хвилини, інакше дата («12 лист.», з роком, якщо рік інший). */
export const listTime = (iso: string, now: Date): string => {
  const date = new Date(iso);
  if (daysBetween(date, now) === 0) return TIME.format(date);
  return (date.getFullYear() === now.getFullYear() ? SHORT : SHORT_YEAR).format(date);
};
