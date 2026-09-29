import { describe, expect, it } from "vitest";
import { TAGS, TAGS_BY_ID, TAG_GROUPS } from "@/lib/tags/dictionary";
import { normalizeTagText } from "@/lib/tags/normalize";
import { phraseKey } from "@/lib/tags/detect";

/** Усі фрази, за якими тег шукається в тексті: id, назва й синоніми. */
const phrasesOf = (tag: (typeof TAGS)[number]) => [tag.id, tag.label, ...tag.synonyms];

describe("normalizeTagText", () => {
  it("зводить регістр, апострофи й розділові знаки", () => {
    expect(normalizeTagText("  Telegram-бот!  ")).toBe("telegram бот");
    expect(normalizeTagText("кав’ярня")).toBe("кав'ярня");
    expect(normalizeTagText("ЁЛКА")).toBe("елка");
  });

  it("не ламає назви з крапкою й плюсами", () => {
    expect(normalizeTagText("Next.js")).toBe("next.js");
    expect(normalizeTagText("C# і C++.")).toBe("c# і c++");
  });
});

describe("словник тегів", () => {
  it("має унікальні id у форматі kebab-case", () => {
    expect(TAGS_BY_ID.size).toBe(TAGS.length);
    for (const tag of TAGS) expect(tag.id, tag.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("кожна група не порожня", () => {
    for (const group of TAG_GROUPS) {
      expect(TAGS.some((tag) => tag.group === group.id), group.id).toBe(true);
    }
  });

  // Головна перевірка: одна фраза веде рівно до одного тегу, інакше
  // «вайбер» міг би означати і бота, і розсилку, і підбір гадав би.
  it("жодна фраза не належить двом тегам", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const tag of TAGS) {
      for (const phrase of new Set(phrasesOf(tag).map(normalizeTagText))) {
        const other = owner.get(phrase);
        if (other && other !== tag.id) clashes.push(`«${phrase}»: ${other} і ${tag.id}`);
        owner.set(phrase, tag.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  // Те саме, але після відрізання закінчень: «бота» і «боти» — одна основа,
  // тож і вони не можуть вести до різних тегів.
  it("жодна основа фрази не належить двом тегам", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const tag of TAGS) {
      for (const key of new Set(phrasesOf(tag).map(phraseKey))) {
        const other = owner.get(key);
        if (other && other !== tag.id) clashes.push(`«${key}»: ${other} і ${tag.id}`);
        owner.set(key, tag.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("синоніми не повторюють id, назву чи один одного", () => {
    const repeats: string[] = [];
    for (const tag of TAGS) {
      const seen = new Set([normalizeTagText(tag.id), normalizeTagText(tag.label)]);
      for (const synonym of tag.synonyms) {
        const phrase = normalizeTagText(synonym);
        if (seen.has(phrase)) repeats.push(`${tag.id}: «${synonym}»`);
        seen.add(phrase);
      }
    }
    expect(repeats).toEqual([]);
  });

  it("жодне слово не змішує латиницю з кирилицею", () => {
    const mixed = TAGS.flatMap((tag) =>
      phrasesOf(tag)
        .flatMap((phrase) => normalizeTagText(phrase).split(" "))
        .filter((word) => /\p{Script=Latin}/u.test(word) && /\p{Script=Cyrillic}/u.test(word))
        .map((word) => `${tag.id}: ${word}`)
    );
    expect(mixed).toEqual([]);
  });

  it("батьки й схожі теги існують, без петель і з вагою від 0 до 1", () => {
    for (const tag of TAGS) {
      if (tag.parent) {
        expect(TAGS_BY_ID.has(tag.parent), `${tag.id} → ${tag.parent}`).toBe(true);
        expect(tag.parent).not.toBe(tag.id);
        const chain = new Set([tag.id]);
        let parent = tag.parent;
        while (parent) {
          expect(chain.has(parent), `цикл через ${parent}`).toBe(false);
          chain.add(parent);
          parent = TAGS_BY_ID.get(parent)?.parent ?? "";
        }
      }
      for (const [id, weight] of Object.entries(tag.related ?? {})) {
        expect(TAGS_BY_ID.has(id), `${tag.id} ~ ${id}`).toBe(true);
        expect(id).not.toBe(tag.id);
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });
});
