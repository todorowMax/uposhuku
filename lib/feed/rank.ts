// lib/feed/rank.ts
//
// Порядок стрічки виконавця й курсор для «Показати ще». Чиста логіка без бази:
// ранг = скільки тегів профілю закрито, потім своє місто, потім свіжіші, потім id.
// Ключ містить усе, за чим сортуємо, тож курсор стабільний і за однакового часу.

/** Що визначає місце запиту в стрічці. */
export interface RankKey {
  /** Скільки тегів запиту закриває профіль. */
  matched: number;
  /** Запит із міста самого виконавця. */
  city: boolean;
  /** Час створення, мс від епохи. */
  createdAt: number;
  id: string;
}

/** Розмір сторінки стрічки. */
export const FEED_PAGE = 30;

const byId = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/** Для `sort`: кращі першими, повний порядок (id розводить усе інше). */
export const compareRank = (a: RankKey, b: RankKey) => b.matched - a.matched || Number(b.city) - Number(a.city) || b.createdAt - a.createdAt || byId(a.id, b.id);

export const encodeCursor = (key: RankKey) => `${key.matched}|${key.city ? 1 : 0}|${key.createdAt}|${key.id}`;

/** Некоректний курсор дає null: тоді віддаємо першу сторінку. */
export const parseCursor = (value: string | null): RankKey | null => {
  const match = /^(\d{1,3})\|([01])\|(\d{1,15})\|([\w-]{1,40})$/.exec(value ?? "");
  return match ? { matched: Number(match[1]), city: match[2] === "1", createdAt: Number(match[3]), id: match[4] } : null;
};

/**
 * Сторінка після курсора з уже відсортованого списку. `next` — курсор останнього
 * елемента, якщо за ним ще є що показати, інакше null.
 */
export const pageAfter = <T extends RankKey>(sorted: readonly T[], cursor: RankKey | null, size: number): { items: T[]; next: string | null } => {
  const rest = cursor ? sorted.filter((item) => compareRank(item, cursor) > 0) : [...sorted];
  const items = rest.slice(0, size);
  return { items, next: rest.length > size && items.length > 0 ? encodeCursor(items[items.length - 1]) : null };
};
