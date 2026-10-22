// lib/tags/search.ts
//
// Пошук тегу за кількома літерами: для «+ Додати тег» у профілі, у роботах,
// у полі запиту й у фільтрах карти. Шукає по назві, id і всіх синонімах
// (українською, російською, англійською, транслітом), тому «тг бот» знаходить
// «Telegram-бот», а «нова пош» — «Нову Пошту».
//
// Окремо від detect.ts: той шукає фрази в довгому тексті, цей — тег за
// короткими літерами, які людина набирає просто зараз.

import { TAGS, TAGS_BY_ID } from "./dictionary";
import { normalizeTagText } from "./normalize";
import { stemWord } from "./detect";

export type TagHitVia = "label" | "synonym" | "id";

export interface TagHit {
  tagId: string;
  /** 0–100: чим більше, тим точніший збіг. */
  score: number;
  via: TagHitVia;
  /** Фраза словника, що збіглася: для підказки «за словом „тг бот“». */
  phrase: string;
}

interface Entry {
  tagId: string;
  via: TagHitVia;
  phrase: string;
  norm: string;
  words: string[];
  stems: string[];
}

/** Мінімальна довжина запиту: з однієї літери видача була б шумом. */
const MIN_QUERY = 2;
/** Збіг у середині слова рахуємо лише від цієї довжини, інакше «ат» знайде пів словника. */
const SUBSTRING_MIN = 3;
/** Скільки віднімаємо, коли запит набрано не в тій розкладці. */
const LAYOUT_PENALTY = 15;

let index: Entry[] | null = null;

const toEntry = (tagId: string, via: TagHitVia, phrase: string): Entry | null => {
  const norm = normalizeTagText(phrase);
  if (!norm) return null;
  const words = norm.split(" ");
  return { tagId, via, phrase, norm, words, stems: words.map(stemWord) };
};

/** Індекс будується один раз, при першому пошуку. */
const entries = (): Entry[] => {
  if (index) return index;
  const result: Entry[] = [];
  for (const tag of TAGS) {
    const label = toEntry(tag.id, "label", tag.label);
    if (label) result.push(label);
    // id майже завжди повторює назву (figma), тож додаємо його, лише коли він інший.
    const id = toEntry(tag.id, "id", tag.id.replaceAll("-", " "));
    if (id && id.norm !== label?.norm) result.push(id);
    for (const synonym of tag.synonyms) {
      const entry = toEntry(tag.id, "synonym", synonym);
      if (entry && entry.norm !== label?.norm) result.push(entry);
    }
  }
  index = result;
  return result;
};

/** Розкладка ЙЦУКЕН (українська) на клавішах QWERTY: «asuvf» набрано замість «фігма». */
const LAYOUT: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з", "[": "х", "]": "ї",
  a: "ф", s: "і", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л", l: "д", ";": "ж", "'": "є",
  z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь", ",": "б", ".": "ю",
};

const fromLatinLayout = (text: string): string | null => {
  if (!/^[a-z\s[\];',.]+$/i.test(text)) return null;
  const converted = [...text.toLowerCase()].map((char) => LAYOUT[char] ?? char).join("");
  return converted === text.toLowerCase() ? null : converted;
};

/** Оцінка одного запису словника для запиту; 0 — не збіглося. */
const scoreEntry = (entry: Entry, query: string, words: string[], stems: string[]): number => {
  const main = entry.via === "label";
  if (entry.norm === query) return main ? 100 : 90;
  if (entry.norm.startsWith(query)) return main ? 80 : 70;
  // Усі слова запиту — початки різних слів фрази, порядок неважливий: «бот тг».
  if (words.every((word) => entry.words.some((own) => own.startsWith(word)))) return main ? 60 : 50;
  // Те саме за основами слів: «стоматологію» знаходить «Стоматологія».
  if (stems.every((stem) => entry.stems.some((own) => own.startsWith(stem)))) return 45;
  if (query.length >= SUBSTRING_MIN && entry.norm.includes(query)) return 30;
  return 0;
};

export interface SearchOptions {
  limit?: number;
  /** Теги, яких у видачі бути не має: уже вибрані. */
  exclude?: Iterable<string>;
}

/** Найкращі збіги за запитом, найточніші першими. Порожній чи надто короткий запит дає `[]`. */
export const searchTags = (rawQuery: string, { limit = 30, exclude = [] }: SearchOptions = {}): TagHit[] => {
  const query = normalizeTagText(rawQuery);
  if (query.length < MIN_QUERY) return [];

  const variants: { query: string; penalty: number }[] = [{ query, penalty: 0 }];
  const converted = fromLatinLayout(query);
  if (converted) variants.push({ query: normalizeTagText(converted), penalty: LAYOUT_PENALTY });

  const prepared = variants.map((variant) => {
    const words = variant.query.split(" ").filter(Boolean);
    return { ...variant, words, stems: words.map(stemWord) };
  });

  const skip = new Set(exclude);
  const best = new Map<string, TagHit>();
  for (const entry of entries()) {
    if (skip.has(entry.tagId)) continue;
    for (const variant of prepared) {
      const base = scoreEntry(entry, variant.query, variant.words, variant.stems);
      const score = base - variant.penalty;
      if (base === 0 || score <= 0) continue;
      const current = best.get(entry.tagId);
      if (!current || score > current.score) best.set(entry.tagId, { tagId: entry.tagId, score, via: entry.via, phrase: entry.phrase });
    }
  }

  const label = (tagId: string) => TAGS_BY_ID.get(tagId)?.label ?? tagId;
  return [...best.values()]
    .sort((a, b) => b.score - a.score || label(a.tagId).length - label(b.tagId).length || label(a.tagId).localeCompare(label(b.tagId), "uk"))
    .slice(0, limit);
};
