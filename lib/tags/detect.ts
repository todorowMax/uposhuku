// lib/tags/detect.ts
//
// Теги у вільному тексті запиту, як дії в кроках рецепта в ukoshiku:
// людина пише прозою («потрібен бот у телеграмі для запису клієнтів у
// стоматологію»), а ми знаходимо в тексті фрази зі словника й повертаємо
// їхні межі в оригінальному рядку. Поле запиту підсвічує саме ці межі,
// а знайдені теги стають чипами.
//
// Слова порівнюємо за основою: «стоматологію» і «стоматологія» — одне.
// Довша фраза перемагає: «дизайн інтер'єру» — це ремонт, а не UI-дизайн.
// Це евристика, а не морфологічний аналізатор: закінчення відрізаємо за
// списком, як у ukoshiku, і список росте з реальних запитів.

import { TAGS } from "./dictionary";
import { normalizeTagText } from "./normalize";

/** Слово разом із назвами на кшталт next.js, c#, c++, 1с. */
const TOKEN_RE = /[\p{L}\p{N}]+(?:['’ʼ`][\p{L}\p{N}]+)*(?:[.+#][\p{L}\p{N}+#]*)*/gu;

/**
 * Закінчення українських і російських слів, довші першими. Відрізаємо
 * одне, і лише коли лишається щонайменше 3 літери: «бот» не стане «бо».
 */
const ENDINGS = [
  "ями", "ами", "ові", "еві", "ого", "ому", "ими", "ях", "ах", "ів", "їв", "ов", "ев", "іх", "их", "ім", "им",
  "ою", "ею", "ий", "ій", "ої", "ей", "ом", "ем", "ам", "ям", "ії", "ію", "ія", "ия", "ие", "ию",
  "ых", "ым", "ой", "ая", "ое", "ые", "ую", "яя", "ее",
  "а", "я", "у", "ю", "і", "ї", "и", "е", "о", "ь", "й", "ы", "є",
];

const CYRILLIC = /\p{Script=Cyrillic}/u;

export const stemWord = (word: string): string => {
  if (CYRILLIC.test(word)) {
    if (word.length < 4) return word;
    for (const ending of ENDINGS) {
      if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
    }
    return word;
  }
  // Латиниця: множина «bots», «apps».
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
};

/** Фраза як ключ: нормалізовані основи через пробіл. */
export const phraseKey = (phrase: string): string =>
  normalizeTagText(phrase).split(" ").filter(Boolean).map(stemWord).join(" ");

interface PhraseIndex {
  byKey: Map<string, string>;
  longest: number;
  /** Однослівні основи від PREFIX_MIN літер: для «манікюрного» → «манікюр». */
  singles: Map<string, string>;
}

/**
 * Коротші основи надто легко збігаються з чужими словами («йог» у «його»),
 * тож пошук за початком слова лише для довгих основ.
 */
const PREFIX_MIN = 5;

let index: PhraseIndex | null = null;

/** Індекс фраз словника будується один раз, при першому пошуку. */
const phraseIndex = (): PhraseIndex => {
  if (index) return index;
  const byKey = new Map<string, string>();
  const singles = new Map<string, string>();
  let longest = 1;
  for (const tag of TAGS) {
    for (const phrase of [tag.id, tag.label, ...tag.synonyms]) {
      const key = phraseKey(phrase);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, tag.id);
      longest = Math.max(longest, key.split(" ").length);
      if (!key.includes(" ") && key.length >= PREFIX_MIN) singles.set(key, tag.id);
    }
  }
  index = { byKey, longest, singles };
  return index;
};

export interface TagMention {
  tagId: string;
  /** Межі згадки в оригінальному тексті, для підсвічування. */
  start: number;
  end: number;
}

interface Token {
  stem: string;
  start: number;
  end: number;
}

const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    if (match.index === undefined) continue;
    // Один токен після нормалізації може стати кількома словами: «e-commerce» → «e commerce».
    const words = normalizeTagText(match[0]).split(" ").filter(Boolean);
    let end = match.index + match[0].length;
    // Крапка в кінці речення — не частина слова.
    if (match[0].endsWith(".")) end -= 1;
    for (const word of words) tokens.push({ stem: stemWord(word), start: match.index, end });
  }
  return tokens;
};

/** Найдовша однослівна основа, з якої починається слово: «манікюрн» → «манікюр». */
const prefixMatch = (stem: string, singles: Map<string, string>): string | undefined => {
  for (let length = stem.length - 1; length >= PREFIX_MIN; length--) {
    const tagId = singles.get(stem.slice(0, length));
    if (tagId) return tagId;
  }
  return undefined;
};

/**
 * Згадки тегів у тексті: непересічні, зліва направо, довша фраза
 * перемагає коротшу, що починається з того самого слова. Слово, що не
 * збіглося цілком, ще пробуємо за початком: так «манікюрного кабінету»
 * знаходить «манікюр», а «ветеринарну» — «ветеринар».
 */
export const detectTagMentions = (text: string): TagMention[] => {
  const { byKey, longest, singles } = phraseIndex();
  const tokens = tokenize(text);
  const mentions: TagMention[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = 0;
    for (let length = Math.min(longest, tokens.length - i); length > 0; length--) {
      const key = tokens.slice(i, i + length).map((token) => token.stem).join(" ");
      const tagId = byKey.get(key);
      if (tagId) {
        mentions.push({ tagId, start: tokens[i].start, end: tokens[i + length - 1].end });
        matched = length;
        break;
      }
    }
    if (!matched) {
      const tagId = prefixMatch(tokens[i].stem, singles);
      if (tagId) mentions.push({ tagId, start: tokens[i].start, end: tokens[i].end });
    }
    i += matched || 1;
  }
  return combineBots(mentions);
};

/**
 * «Бот» і месенджер в одному запиті — це бот саме в цьому месенджері:
 * «бот в телегу» — Telegram-бот, а не «чат-бот» плюс «Telegram-канали».
 */
const BOT_IN_MESSENGER: Record<string, string> = {
  "telegram-api": "telegram-bot",
  "viber-api": "viber-bot",
  "whatsapp-api": "whatsapp-bot",
  instagram: "instagram-bot",
  slack: "slack-bot",
};

const combineBots = (mentions: TagMention[]): TagMention[] => {
  if (!mentions.some((mention) => mention.tagId === "chat-bot")) return mentions;
  const messenger = mentions.find((mention) => BOT_IN_MESSENGER[mention.tagId]);
  if (!messenger) return mentions;
  const bot = BOT_IN_MESSENGER[messenger.tagId];
  return mentions.map((mention) =>
    mention.tagId === "chat-bot" || mention.tagId === messenger.tagId ? { ...mention, tagId: bot } : mention
  );
};

/** Унікальні теги в порядку першої згадки. */
export const detectTags = (text: string): string[] => [...new Set(detectTagMentions(text).map((m) => m.tagId))];
