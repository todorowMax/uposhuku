// lib/chat/feed.ts
//
// Стрічка розмови як список блоків: розділювачі днів, репліки людей, події угод (підряд події однієї угоди
// згортаються в групу), рішення модератора окремою карточкою, короткі службові рядки таблеткою. Чиста логіка без
// React, щоб її можна було перевірити тестом.

import type { ChatLine } from "./client";
import { dayKey, dayLabel } from "./dates";

/** Номер угоди в тексті службового рядка: `#E571` (див. `lib/deals/machine.ts`). */
const DEAL_NUMBER = /#[0-9A-Z]{3,}/;
const MODERATOR_PREFIX = "Модератор розглянув спір";
const COMMENT_MARK = ". Коментар модератора: ";

export const dealNumberOf = (text: string): string | null => DEAL_NUMBER.exec(text)?.[0] ?? null;

export type ModeratorDecision = { number: string | null; outcome: string; comment: string | null };

/** Рядок рішення модератора (`lib/admin/decisions.ts`): що вирішено й коментар окремо; інші рядки дають null. */
export const parseModeratorDecision = (text: string): ModeratorDecision | null => {
  if (!text.startsWith(MODERATOR_PREFIX)) return null;
  const [head, ...rest] = text.split(COMMENT_MARK);
  const colon = head.indexOf(": ");
  const outcome = colon === -1 ? head : head.slice(colon + 2);
  const comment = rest.join(COMMENT_MARK).trim();
  return { number: dealNumberOf(head), outcome: outcome.replace(/\.$/, ""), comment: comment || null };
};

export type FeedItem =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; line: ChatLine }
  | { type: "pill"; key: string; line: ChatLine }
  | { type: "moderator"; key: string; line: ChatLine; decision: ModeratorDecision }
  | { type: "deal"; key: string; number: string; lines: ChatLine[] };

/**
 * Стрічка для показу. Підряд події однієї угоди (в межах одного дня) стають одним блоком `deal`; репліка людини,
 * картка модератора, інша угода чи новий день розривають групу.
 */
export const buildFeed = (lines: ChatLine[], now: Date): FeedItem[] => {
  const items: FeedItem[] = [];
  let day = "";
  for (const line of lines) {
    const key = dayKey(new Date(line.at));
    if (key !== day) {
      day = key;
      items.push({ type: "day", key: `day-${line.id}`, label: dayLabel(line.at, now) });
    }
    if (line.kind !== "system") {
      items.push({ type: "message", key: line.id, line });
      continue;
    }
    const decision = parseModeratorDecision(line.text);
    if (decision) {
      items.push({ type: "moderator", key: line.id, line, decision });
      continue;
    }
    const number = dealNumberOf(line.text);
    if (!number) {
      items.push({ type: "pill", key: line.id, line });
      continue;
    }
    const last = items.at(-1);
    if (last?.type === "deal" && last.number === number) last.lines.push(line);
    else items.push({ type: "deal", key: line.id, number, lines: [line] });
  }
  return items;
};

/** Яка угода пари стоїть за номером: спершу за `contextId` рядка (id угоди), інакше за номером серед угод розмови. */
export const resolveDealId = (lines: Pick<ChatLine, "contextId">[], number: string, deals: { id: string; number: string }[]): string | undefined => {
  for (const line of [...lines].reverse()) {
    const byId = line.contextId ? deals.find((deal) => deal.id === line.contextId) : undefined;
    if (byId) return byId.id;
  }
  return deals.find((deal) => deal.number === number)?.id;
};

/** Людина дивиться на низ стрічки (запас у пікселях): лише тоді нове повідомлення прокручує її донизу. */
export const isNearBottom = (box: { scrollHeight: number; scrollTop: number; clientHeight: number }, threshold = 80): boolean => box.scrollHeight - box.scrollTop - box.clientHeight <= threshold;

/**
 * Куди прокрутити стрічку, коли зверху додались старіші повідомлення: на скільки виросла висота, на стільки
 * зсуваємо позицію, тож людина лишається на тому самому повідомленні.
 */
export const scrollTopAfterPrepend = (before: { scrollHeight: number; scrollTop: number }, scrollHeight: number): number => before.scrollTop + (scrollHeight - before.scrollHeight);
