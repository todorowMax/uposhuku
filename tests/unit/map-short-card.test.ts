import { describe, expect, it } from "vitest";
import { dealsLabel, groupTitle, pluralUk, pluralWordUk, rowLine, shortStats } from "@/lib/map/short-card";
import { placeBeside } from "@/lib/maplibre/place-beside";
import type { PerformerStats } from "@/lib/map/types";

const stats = (patch: Partial<PerformerStats> = {}): PerformerStats => ({ months: 8, orders: 7, rating: 4.8, reviews: 12, verifiedReviews: 0, ...patch });

describe("множина українською", () => {
  it("угоди: 1, 2-4, 5-20, 21, 22, 11", () => {
    expect(dealsLabel(1)).toBe("1 угода");
    expect(dealsLabel(3)).toBe("3 угоди");
    expect(dealsLabel(7)).toBe("7 угод");
    expect(dealsLabel(0)).toBe("0 угод");
    expect(dealsLabel(11)).toBe("11 угод");
    expect(dealsLabel(21)).toBe("21 угода");
    expect(dealsLabel(22)).toBe("22 угоди");
  });
  it("довільні форми", () => {
    expect(pluralUk(5, ["a", "b", "c"])).toBe("5 c");
  });
});

describe("рядок у списку групи", () => {
  it("рядок списку", () => {
    expect(rowLine(stats())).toBe("★ 4,8 · 7 угод");
    expect(rowLine(stats({ rating: null, reviews: 0, orders: 1 }))).toBe("Ще без відгуків · 1 угода");
  });
});

describe("заголовок групи", () => {
  it("люди й запити", () => {
    expect(groupTitle(4, 1)).toBe("4 виконавці · 1 запит");
    expect(groupTitle(12, 0)).toBe("12 виконавців");
    expect(groupTitle(0, 5)).toBe("5 запитів");
    expect(groupTitle(21, 0)).toBe("21 виконавець");
  });
});

describe("placeBeside", () => {
  const base = { size: { width: 280, height: 200 }, bounds: { width: 1000, height: 700 }, gap: 12, margin: 16, topEdge: 120 };
  it("праворуч, коли вміщається", () => {
    const place = placeBeside({ ...base, anchor: { left: 100, top: 300, width: 40, height: 40 } });
    expect(place.side).toBe("right");
    expect(place.left).toBe(152);
  });
  it("ліворуч, коли справа тісно", () => {
    const place = placeBeside({ ...base, anchor: { left: 900, top: 300, width: 40, height: 40 } });
    expect(place.side).toBe("left");
    expect(place.left).toBe(608);
  });
  it("не заходить під поле запиту", () => {
    expect(placeBeside({ ...base, anchor: { left: 100, top: 20, width: 40, height: 40 } }).top).toBe(120);
  });
});

describe("цифри короткої картки рядком", () => {
  const stats = (over: Partial<PerformerStats>): PerformerStats => ({ months: 0, orders: 0, rating: null, reviews: 0, verifiedReviews: 0, ...over });

  it("рейтинг із числом відгуків, угоди словом у формі, місяці на платформі", () => {
    expect(shortStats(stats({ rating: 4.7, reviews: 3, orders: 0, months: 1 }))).toEqual([
      { value: "★ 4,7", label: "3 відгуки" },
      { value: "0", label: "угод" },
      { value: "1 міс.", label: "на Findlyfy" },
    ]);
    expect(shortStats(stats({ rating: 5, reviews: 1, orders: 1, months: 14 }))[1]).toEqual({ value: "1", label: "угода" });
    expect(shortStats(stats({ orders: 3 }))[1].label).toBe("угоди");
  });

  it("без відгуків і новачок: прочерк і «новий», а не нулі", () => {
    const [rating, , platform] = shortStats(undefined);
    expect(rating).toEqual({ value: "—", label: "без відгуків" });
    expect(platform).toEqual({ value: "новий", label: "на Findlyfy" });
  });

  it("слово без числа", () => {
    expect(pluralWordUk(21, ["угода", "угоди", "угод"])).toBe("угода");
    expect(pluralWordUk(12, ["угода", "угоди", "угод"])).toBe("угод");
  });
});
