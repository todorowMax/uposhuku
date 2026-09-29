// lib/tags/suggest.ts
//
// Що ще запропонувати сірим чипом із «+». Матриця супутників
// (lib/tags/companions.ts) каже, що зазвичай потрібно разом: інтернет-
// магазину — каталог, кошик, Нова Пошта, Checkbox. Це не матриця
// схожості для підбору (там «Telegram-бот ≈ Чат-бот»), а доповнення.

import { COMPANIONS } from "./companions";
import { TAGS, TAGS_BY_ID } from "./dictionary";

/** Уточнення тегу: «Мобільний застосунок» → iOS, Android. */
const CHILDREN = new Map<string, string[]>();
for (const tag of TAGS) {
  if (tag.parent) CHILDREN.set(tag.parent, [...(CHILDREN.get(tag.parent) ?? []), tag.id]);
}
/** Наскільки пропонуємо уточнення, коли людина назвала лише загальний тег. */
const CHILD_WEIGHT = 0.7;

const ancestors = (id: string): string[] => {
  const chain: string[] = [];
  for (let parent = TAGS_BY_ID.get(id)?.parent; parent; parent = TAGS_BY_ID.get(parent)?.parent) chain.push(parent);
  return chain;
};

export interface TagSuggestion {
  tagId: string;
  /** 0–1: наскільки ймовірно, що тег потрібен. */
  score: number;
  /** Через який із вибраних тегів його запропоновано, найсильніший. */
  because: string;
}

/**
 * Кілька вибраних тегів «голосують» за супутника незалежно:
 * 1 − Π(1 − w). Два слабкі збіги разом важать більше за один.
 */
export const suggestTags = (
  selected: string[],
  { exclude = [], limit = 6, minScore = 0.45 }: { exclude?: string[]; limit?: number; minScore?: number } = {}
): TagSuggestion[] => {
  // Ширший тег поруч із вужчим нічого не додає: є «Telegram-бот» — «Чат-бот» не пропонуємо.
  const skip = new Set([...selected, ...exclude, ...selected.flatMap(ancestors)]);
  const votes = new Map<string, { miss: number; because: string; best: number }>();
  for (const source of selected) {
    const children = Object.fromEntries((CHILDREN.get(source) ?? []).map((child) => [child, CHILD_WEIGHT]));
    for (const [tagId, weight] of Object.entries({ ...children, ...COMPANIONS[source] })) {
      if (skip.has(tagId)) continue;
      const vote = votes.get(tagId) ?? { miss: 1, because: source, best: 0 };
      vote.miss *= 1 - weight;
      if (weight > vote.best) {
        vote.best = weight;
        vote.because = source;
      }
      votes.set(tagId, vote);
    }
  }
  return [...votes.entries()]
    .map(([tagId, vote]) => ({ tagId, score: 1 - vote.miss, because: vote.because }))
    .filter((suggestion) => suggestion.score >= minScore)
    .sort((a, b) => b.score - a.score || a.tagId.localeCompare(b.tagId))
    .slice(0, limit);
};
