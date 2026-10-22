import { describe, expect, it } from "vitest";
import { searchTags } from "@/lib/tags/search";

const ids = (query: string, limit = 30) => searchTags(query, { limit }).map((hit) => hit.tagId);

describe("searchTags", () => {
  it("знаходить тег за синонімом", () => {
    const [first] = searchTags("тг бот");
    expect(first.tagId).toBe("telegram-bot");
    expect(first.via).toBe("synonym");
    expect(first.phrase).toBe("тг бот");
  });

  it("за «телеграм» у першій п'ятірці і бот, і канали", () => {
    const top = ids("телеграм", 5);
    expect(top).toContain("telegram-bot");
    expect(top).toContain("telegram-api");
  });

  it("за початком назви", () => {
    expect(ids("нова пош")[0]).toBe("nova-poshta");
  });

  it("точна назва перемагає похідні", () => {
    const list = ids("сайт", 300);
    expect(list[0]).toBe("website");
    expect(list).toContain("landing");
  });

  it("не залежить від регістру й зайвих пробілів", () => {
    expect(ids("Figma")).toEqual(ids("FIGMA"));
    expect(ids("  figma ")).toEqual(ids("figma"));
    expect(ids("figma")[0]).toBe("figma");
  });

  it("розуміє запит у не тій розкладці", () => {
    expect(ids("asuvf").slice(0, 3)).toContain("figma");
  });

  it("слова в довільному порядку", () => {
    expect(ids("бот тг").slice(0, 5)).toContain("telegram-bot");
  });

  it("форма слова: «стоматологію» знаходить «Стоматологія»", () => {
    const list = ids("стоматологію");
    expect(list.length).toBeGreaterThan(0);
  });

  it("exclude прибирає вибрані теги", () => {
    expect(ids("telegram")).toContain("telegram-bot");
    expect(searchTags("telegram", { exclude: ["telegram-bot"] }).map((hit) => hit.tagId)).not.toContain("telegram-bot");
  });

  it("порожній і надто короткий запит, а також нісенітниця", () => {
    expect(searchTags("")).toEqual([]);
    expect(searchTags(" ")).toEqual([]);
    expect(searchTags("а")).toEqual([]);
    expect(searchTags("qwertyzxc")).toEqual([]);
  });

  it("поважає limit", () => {
    expect(searchTags("сайт", { limit: 3 })).toHaveLength(3);
  });
});
