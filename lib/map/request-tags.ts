// lib/map/request-tags.ts
//
// Теги запиту, які поле вводу передає карті. Поле й карта — сусіди на
// сторінці без спільного батька зі станом, тож тримаємо маленьке сховище
// з підпискою для useSyncExternalStore.

const EMPTY: string[] = [];
let current: string[] = EMPTY;
const listeners = new Set<() => void>();

export const setRequestTags = (tags: string[]) => {
  const next = tags.length ? tags : EMPTY;
  if (next.length === current.length && next.every((tag, index) => tag === current[index])) return;
  current = next;
  for (const listener of listeners) listener();
};

export const getRequestTags = () => current;
export const getServerRequestTags = () => EMPTY;

export const subscribeRequestTags = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
