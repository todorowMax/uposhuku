import { describe, expect, it } from "vitest";
import { daysLabel, plural, priceLabel } from "@/lib/requests/format";

describe("plural", () => {
  it.each([
    [1, "день"],
    [2, "дні"],
    [4, "дні"],
    [5, "днів"],
    [11, "днів"],
    [12, "днів"],
    [14, "днів"],
    [21, "день"],
    [22, "дні"],
    [111, "днів"],
    [0, "днів"],
  ])("%i -> %s", (count, word) => {
    expect(plural(count, "день", "дні", "днів")).toBe(word);
  });
});

describe("daysLabel", () => {
  it("додає число й правильну форму", () => {
    expect(daysLabel(1)).toBe("1 день");
    expect(daysLabel(3)).toBe("3 дні");
    expect(daysLabel(10)).toBe("10 днів");
  });
});

describe("priceLabel", () => {
  it("без ціни: після обговорення", () => {
    expect(priceLabel(null)).toBe("Ціна після обговорення");
  });

  it("ціна з роздільником тисяч і гривнею", () => {
    const label = priceLabel(15000);
    expect(label.endsWith(" ₴")).toBe(true);
    expect(label.replace(/\s/g, "")).toBe("15000₴");
  });
});
