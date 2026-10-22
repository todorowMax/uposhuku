import { describe, expect, it } from "vitest";
import { applyRequestFilter } from "@/lib/feed/map-requests";
import type { MapRequest } from "@/lib/feed/types";

const request = (id: string, tags: string[], extra: Partial<MapRequest> = {}) =>
  ({ id, tags: tags.map((tag) => ({ id: tag, label: tag, matched: false })), matchedTags: 0, own: false, point: { lat: 50, lng: 30 }, ...extra }) as unknown as MapRequest;

describe("фільтр запитів за тегами з «Фільтрів»", () => {
  const items = [request("a", ["webflow", "website"]), request("b", ["telegram-bot"]), request("c", ["figma"])];

  it("без тегів нічого не відсіює", () => {
    expect(applyRequestFilter(items, "all")).toHaveLength(3);
    expect(applyRequestFilter(items, "all", [])).toHaveLength(3);
  });

  it("лишає запити, де є хоч один вибраний тег", () => {
    expect(applyRequestFilter(items, "all", ["webflow"]).map((item) => item.id)).toEqual(["a"]);
    expect(applyRequestFilter(items, "all", ["webflow", "figma"]).map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("працює разом з іншим фільтром", () => {
    const list = [request("a", ["webflow"], { budget: "10 000 ₴" } as Partial<MapRequest>), request("b", ["webflow"])];
    expect(applyRequestFilter(list, "budget", ["webflow"]).map((item) => item.id)).toEqual(["a"]);
  });
});
