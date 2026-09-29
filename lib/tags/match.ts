// lib/tags/match.ts
//
// Хто з виконавців підходить під теги запиту. Поки без ваг і рейтингу:
// карта лише відсіює тих, у кого немає нічого схожого. Схожість тегів —
// за словником: той самий тег, батько й дитина, «брати», явні related.

import { TAGS_BY_ID } from "./dictionary";
import { PARENT_SIMILARITY, SIBLING_SIMILARITY } from "./types";

/**
 * Від цього теги вважаємо одним і тим самим: батько й дитина (0,8) так,
 * «брати» (0,5) ні. Хто робить веб-застосунки, не обов'язково робить
 * мобільні, а карта має звужувати вибір, а не показувати майже всіх.
 */
export const MATCH_THRESHOLD = 0.6;

const ancestry = (id: string): string[] => {
  const chain: string[] = [];
  for (let parent = TAGS_BY_ID.get(id)?.parent; parent; parent = TAGS_BY_ID.get(parent)?.parent) chain.push(parent);
  return chain;
};

/** Схожість двох тегів від 0 до 1. Через покоління схожість множиться: застосунок → мобільний → iOS. */
export const tagSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const aUp = ancestry(a);
  const bUp = ancestry(b);
  const aInB = bUp.indexOf(a);
  const bInA = aUp.indexOf(b);
  let best = 0;
  if (aInB >= 0) best = PARENT_SIMILARITY ** (aInB + 1);
  if (bInA >= 0) best = Math.max(best, PARENT_SIMILARITY ** (bInA + 1));
  if (aUp[0] && aUp[0] === bUp[0]) best = Math.max(best, SIBLING_SIMILARITY);
  const related = Math.max(TAGS_BY_ID.get(a)?.related?.[b] ?? 0, TAGS_BY_ID.get(b)?.related?.[a] ?? 0);
  return Math.max(best, related);
};

/** Наскільки профіль закриває хоч один тег запиту: найкращий збіг пари. */
export const matchScore = (requestTags: string[], profileTags: string[]): number => {
  let best = 0;
  for (const wanted of requestTags) {
    for (const offered of profileTags) best = Math.max(best, tagSimilarity(wanted, offered));
    if (best === 1) break;
  }
  return best;
};

/**
 * Id тих, хто підходить. Порожній запит нічого не відсіює: повертаємо null.
 * Галузь («ветеринарія») — контекст, а не навичка: якщо в запиті є що
 * робити (застосунок, дизайн), відсіюємо за цим, а досвід у галузі
 * знадобиться для порядку в списку. Лише за галуззю — коли більше нічого немає.
 */
export const matchProfiles = (requestTags: string[], profiles: { id: string; tags: string[] }[]): Set<string> | null => {
  if (requestTags.length === 0) return null;
  const skills = requestTags.filter((id) => TAGS_BY_ID.get(id)?.group !== "industry");
  const wanted = skills.length ? skills : requestTags;
  return new Set(profiles.filter((profile) => matchScore(wanted, profile.tags) >= MATCH_THRESHOLD).map((p) => p.id));
};
