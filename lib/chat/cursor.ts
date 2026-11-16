// lib/chat/cursor.ts
//
// Курсор «показати раніше»: час створення й id повідомлення, перед яким читаємо. Лише час не годиться: два
// повідомлення з однією мілісекундою на межі сторінки або загубились би, або повторились.

export type MessageCursor = { at: number; id: string };

/** Курсор для рядка `?before=`: `<мс>:<id>`. */
export const encodeCursor = (message: { id: string; at: string }): string => `${Date.parse(message.at)}:${message.id}`;

/** Розбір `?before=`; усе, що не схоже на `<мс>:<id>`, дає null. */
export const parseCursor = (raw: string | null): MessageCursor | null => {
  const match = /^(\d{1,15}):([\w-]{1,64})$/.exec(raw ?? "");
  return match ? { at: Number(match[1]), id: match[2] } : null;
};
