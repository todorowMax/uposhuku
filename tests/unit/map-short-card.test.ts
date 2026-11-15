import { describe, expect, it } from "vitest";
import { dealsLabel, groupTitle, platformLabel, pluralUk, rowLine, shortFacts } from "@/lib/map/short-card";
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

describe("час на платформі", () => {
  it("менше місяця — новий", () => {
    expect(platformLabel(0)).toBe("Новий на Findlyfy");
  });
  it("від місяця — з цифрою", () => {
    expect(platformLabel(8)).toBe("На Findlyfy 8 міс.");
  });
});

describe("підписи короткої картки", () => {
  it("рейтинг з комою й відгуки", () => {
    expect(shortFacts(stats()).reviewsLine).toBe("★ 4,8 · 12 відгуків");
    expect(shortFacts(stats({ rating: 5, reviews: 1 })).reviewsLine).toBe("★ 5,0 · 1 відгук");
  });
  it("без відгуків", () => {
    expect(shortFacts(stats({ rating: null, reviews: 0 })).reviewsLine).toBe("Ще без відгуків");
    expect(shortFacts(undefined).reviewsLine).toBe("Ще без відгуків");
    expect(shortFacts(undefined).platformLine).toBe("Новий на Findlyfy");
  });
  it("перевірені лише коли є", () => {
    expect(shortFacts(stats()).verifiedLine).toBeNull();
    expect(shortFacts(stats({ verifiedReviews: 3 })).verifiedLine).toBe("3 перевірених");
  });
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
