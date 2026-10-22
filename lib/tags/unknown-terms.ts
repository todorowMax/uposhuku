// lib/tags/unknown-terms.ts
//
// Слова із запиту, яких словник не розпізнав. Рахуємо, скільки разів їх
// писали замовники: так словник росте з реальних запитів, а не з наших
// здогадок. Це сигнал попиту, а не дані про людину: лічильник не знає ні
// автора, ні запиту (див. tag_term_stats).

import { detectTagMentions } from "./detect";
import { phraseKey } from "./detect";
import { STOPWORDS } from "./stopwords";

export const UNKNOWN_TERM = { min: 3, max: 30, perText: 20, sampleMax: 40 } as const;

const WORD = /\p{L}+(?:['’ʼ-]\p{L}+)*/gu;

export interface UnknownTerm {
  /** Ключ для підсумків: основи слів, щоб «лайки» й «лайк» збігалися. */
  key: string;
  /** Як написано в запиті, нижнім регістром. */
  sample: string;
}

const isStop = (word: string): boolean => STOPWORDS.has(word) || STOPWORDS.has(word.replace(/['’ʼ-]/g, ""));

/**
 * Окремі слова й пари сусідніх слів, які не потрапили в жодну згадку тегу й
 * не є службовими. Лише літери: цифри й адреси в запитах найчастіше чиїсь
 * особисті дані, а не предмет.
 */
export const unknownTerms = (raw: string): UnknownTerm[] => {
  // Пошта, посилання й телефони: їхні шматки («com», «gmail») не слова запиту, а чиїсь контакти.
  const text = raw.replace(/\S+@\S+|(?:https?:\/\/|www\.)\S+|\+?\d[\d\s()-]{6,}\d/gi, " ");
  const mentions = detectTagMentions(text);
  const covered = (start: number, end: number) => mentions.some((mention) => start < mention.end && end > mention.start);

  const words: { word: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(WORD)) {
    if (match.index === undefined) continue;
    const word = match[0].toLowerCase();
    words.push({ word, start: match.index, end: match.index + match[0].length });
  }

  const free = (item: (typeof words)[number]) =>
    item.word.length >= UNKNOWN_TERM.min && item.word.length <= UNKNOWN_TERM.max && !isStop(item.word) && !covered(item.start, item.end);

  const result = new Map<string, UnknownTerm>();
  const add = (sample: string) => {
    if (result.size >= UNKNOWN_TERM.perText) return;
    const key = phraseKey(sample);
    if (key && !result.has(key)) result.set(key, { key, sample: sample.slice(0, UNKNOWN_TERM.sampleMax) });
  };

  for (let index = 0; index < words.length; index++) {
    const current = words[index];
    if (!free(current)) continue;
    add(current.word);
    const next = words[index + 1];
    // Пара: сусіднє слово, між ними лише пробіл, і воно теж вільне.
    if (next && free(next) && /^\s+$/.test(text.slice(current.end, next.start))) add(`${current.word} ${next.word}`);
  }
  return [...result.values()];
};
