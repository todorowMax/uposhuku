import { describe, expect, it } from "vitest";
import { detectTagMentions, detectTags, stemWord } from "@/lib/tags/detect";
import { suggestTags } from "@/lib/tags/suggest";
import { MATCH_THRESHOLD, matchProfiles, tagSimilarity } from "@/lib/tags/match";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { DEMO_PERFORMERS } from "@/lib/map/demo";
import { SPECIALIST_GROUPS, countGroups, primaryGroup } from "@/lib/map/groups";

describe("stemWord", () => {
  it("зводить відмінки до однієї основи", () => {
    expect(stemWord("стоматологію")).toBe(stemWord("стоматологія"));
    expect(stemWord("домашніх")).toBe(stemWord("домашні"));
    expect(stemWord("ботів")).toBe("бот");
  });

  it("не чіпає короткі слова", () => {
    expect(stemWord("бот")).toBe("бот");
  });
});

describe("detectTags", () => {
  it("знаходить теги в живому запиті", () => {
    const tags = detectTags("хочу створити апку планер розпорядку для своїх домашніх улюбленців");
    expect(tags).toEqual(expect.arrayContaining(["mobile-app", "planner-app", "veterinary"]));
  });

  it("розуміє російську й розмовне «прога»", () => {
    const tags = detectTags("нужна прога чтобы считать калории и планировать питание");
    expect(tags).toEqual(expect.arrayContaining(["app", "calorie-tracker", "meal-planner"]));
  });

  it("довша фраза перемагає коротшу", () => {
    expect(detectTags("потрібен дизайн інтер'єру для квартири")).not.toContain("ui-ux-design");
  });

  it("бот поруч із месенджером — бот у цьому месенджері", () => {
    expect(detectTags("зробіть бот в телегу для нашого ОСББ")).toContain("telegram-bot");
  });

  it("слово, похідне від тригера, теж знаходить тег", () => {
    expect(detectTags("розсилка для манікюрного кабінету")).toContain("beauty");
  });

  it("повертає межі згадок в оригінальному тексті", () => {
    const text = "Сайт для пекарні";
    for (const mention of detectTagMentions(text)) {
      expect(mention.start).toBeGreaterThanOrEqual(0);
      expect(mention.end).toBeLessThanOrEqual(text.length);
      expect(text.slice(mention.start, mention.end).trim()).not.toBe("");
    }
  });
});

describe("suggestTags", () => {
  it("пропонує супутників і уточнення платформи", () => {
    const ids = suggestTags(["mobile-app", "planner-app", "veterinary"], { limit: 8 }).map((s) => s.tagId);
    expect(ids).toEqual(expect.arrayContaining(["notifications", "calendar"]));
    expect(ids.some((id) => id === "ios-app" || id === "android-app" || id === "web-app")).toBe(true);
  });

  it("не пропонує вже вибране й ширше за вибране", () => {
    const ids = suggestTags(["telegram-bot"]).map((s) => s.tagId);
    expect(ids).not.toContain("telegram-bot");
    expect(ids).not.toContain("chat-bot");
  });

  it("інтернет-магазину пропонує типові українські інтеграції", () => {
    const ids = suggestTags(["online-store"], { limit: 10 }).map((s) => s.tagId);
    expect(ids).toEqual(expect.arrayContaining(["nova-poshta", "cart-checkout"]));
  });
});

describe("фільтр карти за тегами запиту", () => {
  it("теги демо-профілів є в словнику", () => {
    const unknown = DEMO_PERFORMERS.flatMap((performer) => performer.tags).filter((id) => !TAGS_BY_ID.has(id));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("батько й дитина — збіг, «брати» — ні", () => {
    expect(tagSimilarity("mobile-app", "ios-app")).toBeCloseTo(0.8);
    expect(tagSimilarity("app", "ios-app")).toBeCloseTo(0.64);
    expect(tagSimilarity("web-app", "mobile-app")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("галузь не відсіює, коли в запиті є що робити", () => {
    const profiles = [
      { id: "dev", tags: ["ios-app", "flutter"] },
      { id: "vet-designer", tags: ["branding", "veterinary"] },
      { id: "web", tags: ["web-app"] },
    ];
    expect(matchProfiles(["mobile-app", "veterinary"], profiles)).toEqual(new Set(["dev"]));
    expect(matchProfiles(["veterinary"], profiles)).toEqual(new Set(["vet-designer"]));
    expect(matchProfiles([], profiles)).toBeNull();
  });

  it("під запит про застосунок для тварин лишається меншість карти", () => {
    const matched = matchProfiles(detectTags("хочу створити апку планер розпорядку для своїх домашніх улюбленців"), DEMO_PERFORMERS);
    expect(matched?.size).toBeGreaterThan(0);
    expect(matched!.size).toBeLessThan(DEMO_PERFORMERS.length / 2);
  });
});

describe("групи спеціалістів для фільтрів", () => {
  it("теги груп є в словнику", () => {
    const unknown = SPECIALIST_GROUPS.flatMap((group) => group.tags).filter((id) => !TAGS_BY_ID.has(id));
    expect(unknown).toEqual([]);
  });

  it("кожен демо-виконавець має групу, найбільша — близько третини", () => {
    expect(DEMO_PERFORMERS.every((performer) => primaryGroup(performer.tags))).toBe(true);
    const groups = countGroups(DEMO_PERFORMERS);
    expect(groups.map((group) => group.count)).toEqual([...groups.map((group) => group.count)].sort((a, b) => b - a));
    const top = groups[0].count / DEMO_PERFORMERS.length;
    expect(top).toBeGreaterThan(0.25);
    expect(top).toBeLessThan(0.4);
  });
});

describe("послуга без продукту", () => {
  it("банери знаходять графічний дизайн, а галузь не тягне підказки для застосунку", () => {
    const tags = detectTags("я хочу зоб мені зробили 3 банери для автомийки");
    expect(tags).toEqual(expect.arrayContaining(["graphic-design", "auto"]));
    const suggested = suggestTags(tags).map((suggestion) => suggestion.tagId);
    expect(suggested).toContain("branding");
    expect(suggested).not.toContain("inventory");
  });

  it("для сайту галузь підказує як завжди", () => {
    expect(suggestTags(detectTags("сайт для стоматології")).map((suggestion) => suggestion.tagId)).toContain("online-booking");
  });
});
