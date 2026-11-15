// lib/chat/unread.ts
//
// Що в списку розмов вважається непрочитаним і як це сказати словами. Чисті функції: рахує сервер
// (`listConversations`), тут лише читання його полів для кнопки й рядків.

import type { ConversationDto } from "./types";

type Counted = Pick<ConversationDto, "unread" | "unreadDeal" | "deal">;

/** Рядок списку непрочитаний: є текст від співрозмовника або подія угоди, що чекає на мене. */
export const isUnread = (item: Pick<ConversationDto, "unread" | "unreadDeal">): boolean => item.unread > 0 || item.unreadDeal;

/** Бейдж на кнопці: розмови з непрочитаним і ті, де угода чекає моєї дії. */
export const attentionCount = (items: Counted[]): number => items.filter((item) => isUnread(item) || item.deal?.needsMe).length;

const FORMS = new Intl.PluralRules("uk");
type Words = Partial<Record<Intl.LDMLPluralRule, string>> & { many: string };
const UNREAD: Words = { one: "непрочитана", few: "непрочитані", many: "непрочитаних" };
const WAITING: Words = { one: "розмова чекає вашої дії", few: "розмови чекають вашої дії", many: "розмов чекають вашої дії" };

const counted = (count: number, words: Words): string => `${count} ${words[FORMS.select(count)] ?? words.many}`;

/**
 * Підпис кнопки. Без числа, коли нічого не чекає; інакше окремо непрочитані розмови («2 непрочитані») і прочитані,
 * де угода чекає моєї дії («1 розмова чекає вашої дії»): друге не називаємо непрочитаним. Розмова рахується один раз,
 * тож сума двох чисел дорівнює бейджу (`attentionCount`).
 */
export const inboxLabel = (items: Counted[]): string => {
  const unread = items.filter(isUnread).length;
  const waiting = items.filter((item) => !isUnread(item) && item.deal?.needsMe).length;
  const parts = [...(unread > 0 ? [counted(unread, UNREAD)] : []), ...(waiting > 0 ? [counted(waiting, WAITING)] : [])];
  return parts.length > 0 ? `Повідомлення: ${parts.join(", ")}` : "Повідомлення";
};
