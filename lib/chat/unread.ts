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
const WORDS: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "непрочитана", few: "непрочитані", many: "непрочитаних" };

/** Підпис кнопки: «Повідомлення» без числа, інакше «Повідомлення: 2 непрочитані» (окремо «1 непрочитана», «5 непрочитаних»). */
export const inboxLabel = (count: number): string => (count > 0 ? `Повідомлення: ${count} ${WORDS[FORMS.select(count)] ?? WORDS.many}` : "Повідомлення");
