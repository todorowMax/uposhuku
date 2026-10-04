// lib/map/filters.ts
//
// Спільний стан фільтрів карти: поле запиту з чипами й карта — сусіди на
// сторінці без спільного батька, тож тримаємо маленькі сховища з
// підпискою для useSyncExternalStore.

import { createStore, useStore, type Store } from "@/lib/store";

export { useStore };

const NONE: readonly string[] = [];

/** Вибрані групи спеціалістів (lib/map/groups.ts); порожньо — усі. */
export const groupFilter = createStore<readonly string[]>(NONE);

/** Вибрані міста з «Фільтрів»; порожньо — будь-яке. */
export const cityFilter = createStore<readonly string[]>(NONE);

/** Увімкнути або вимкнути значення у фільтрі з кількома виборами. */
export const toggleIn = (store: Store<readonly string[]>, id: string) => {
  const current = store.get();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  store.set(next.length ? next : NONE);
};

/** Зняти всі вибори у фільтрі. */
export const clearFilter = (store: Store<readonly string[]>) => store.set(NONE);

/** Лише ті, хто онлайн зараз. */
export const onlineFilter = createStore(false);

/**
 * Хто підходить під теги запиту. null — запиту немає або не підійшов
 * ніхто: тоді карта й чипи рахують усіх. Ставить карта після підбору.
 */
export const tagMatches = createStore<ReadonlySet<string> | null>(null);
