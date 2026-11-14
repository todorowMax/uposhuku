import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/map/cities";
import { REMOTE_CENTER, requestPoint } from "@/lib/feed/request-point";
import { applyRequestFilter } from "@/lib/feed/map-requests";
import type { MapRequest } from "@/lib/feed/types";

const distance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.65);

describe("точка запиту на карті", () => {
  it("запит без міста лежить біля центру України", () => {
    for (const id of ["req_7cd418b56f896079", "req_a1581caf4288873a", "req_seed_3", "x"]) {
      expect(distance(requestPoint(id, null), REMOTE_CENTER)).toBeLessThan(0.8);
    }
  });

  it("стабільна за id, різні id дають різні точки", () => {
    expect(requestPoint("req_1", null)).toEqual(requestPoint("req_1", null));
    const points = new Set(["req_1", "req_2", "req_3", "req_4", "req_5"].map((id) => JSON.stringify(requestPoint(id, null))));
    expect(points.size).toBe(5);
  });

  it("запит з містом лежить поруч із містом, а не в центрі країни", () => {
    const lviv = CITIES.find((city) => city.id === "lviv")!;
    expect(distance(requestPoint("req_1", "lviv"), lviv)).toBeLessThan(0.1);
    expect(distance(requestPoint("req_1", "lviv"), REMOTE_CENTER)).toBeGreaterThan(1);
  });

  it("невідоме місто теж не губить пин: центр України", () => {
    expect(distance(requestPoint("req_1", "nowhere"), REMOTE_CENTER)).toBeLessThan(0.8);
  });
});

describe("фільтр «Віддалено»", () => {
  const item = (id: string, remote: boolean) => ({ id, tags: [], matchedTags: 0, own: false, remote, point: requestPoint(id, remote ? null : "kyiv") }) as unknown as MapRequest;

  it("лишає запити без міста, хоча пин у них є", () => {
    const items = [item("a", true), item("b", false), item("c", true)];
    expect(applyRequestFilter(items, "remote").map((entry) => entry.id)).toEqual(["a", "c"]);
  });
});
