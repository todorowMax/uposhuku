import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { feedFor, parseResponse, removeResponse, saveResponse } from "@/lib/feed/mock-feed";
import { makeUser, useTestD1 } from "../helpers/d1";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";

const NOW = Date.parse("2026-10-03T10:00:00Z");

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["feed-a", "feed-b", "feed-c", "feed-d", "customer-1", "performer-1", "map-owner", "map-perf"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

describe("стрічка запитів виконавця", () => {
  it("показує лише запити, що закривають хоч один тег профілю", async () => {
    const items = await feedFor("feed-a", ["telegram-bot", "n8n"], NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.matchedTags > 0)).toBe(true);
    expect(items.flatMap((item) => item.tags).every((tag) => TAGS_BY_ID.has(tag.id))).toBe(true);
    expect(items[0].tags.some((tag) => tag.matched)).toBe(true);
  });

  it("запити «приходять» з часом, а не всі одразу", async () => {
    const profile = ["mobile-app", "planner-app"];
    const first = await feedFor("feed-b", profile, NOW);
    expect(first.some((item) => item.id === "demo-3")).toBe(false);
    const later = await feedFor("feed-b", profile, NOW + 40_000);
    expect(later.some((item) => item.id === "demo-3")).toBe(true);
  });

  it("найвідповідніші першими, серед рівних свіжіші", async () => {
    const items = await feedFor("feed-c", ["telegram-bot", "online-booking", "monobank", "notifications", "automation", "google-sheets"], NOW + 600_000);
    const counts = items.map((item) => item.matchedTags);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("відгук лишається в запиті, рахується й знімається", async () => {
    const tags = ["telegram-bot"];
    const before = (await feedFor("feed-d", tags, NOW))[0];
    await saveResponse("feed-d", before.id, { price: 9000, days: 7, message: "Добрий день, зроблю." });
    const after = (await feedFor("feed-d", tags, NOW))[0];
    expect(after.response).toMatchObject({ price: 9000, days: 7 });
    expect(after.responses).toBe(before.responses + 1);
    await removeResponse("feed-d", before.id);
    expect((await feedFor("feed-d", tags, NOW))[0].response).toBeNull();
  });
});

describe("відгук виконавця: перевірка тіла", () => {
  const ok = { price: 12500, days: 14, message: "Добрий день! Зроблю, почну завтра." };

  it("приймає ціну числом або «після обговорення»", () => {
    expect(parseResponse(ok)).toMatchObject({ price: 12500, days: 14 });
    expect(parseResponse({ ...ok, price: null })).toMatchObject({ price: null });
  });

  it("відхиляє зайве", () => {
    expect(parseResponse({ ...ok, price: -5 })).toMatch(/ціну/);
    expect(parseResponse({ ...ok, price: "12" })).toMatch(/ціну/);
    expect(parseResponse({ ...ok, days: 0 })).toMatch(/днів/);
    expect(parseResponse({ ...ok, days: 9999 })).toMatch(/днів/);
    expect(parseResponse({ ...ok, message: "ок" })).toMatch(/кілька слів/);
    expect(parseResponse(null)).toMatch(/Порожній/);
  });
});

describe("відгук виконавця доходить до замовника", () => {
  it("справжній відгук з'являється в пропозиціях на запит, з даними профілю", async () => {
    const { createRequest } = await import("@/lib/server/request-repo");
    const { saveProfile } = await import("@/lib/server/profile-repo");
    const { responsesFor } = await import("@/lib/requests/mock-responses");
    const { emptyProfile } = await import("@/lib/profile/types");

    const request = await createRequest("customer-1", { text: "Потрібен лендинг", tags: [{ id: "landing", label: "Лендинг" }], files: [] });
    await saveProfile("performer-1", { ...emptyProfile("Іван"), cityId: "kyiv", specialty: "Розробник сайтів", tags: ["landing", "website"], photo: "data:image/jpeg;base64,AAAA", published: true });
    expect((await feedFor("performer-1", ["landing", "website"], NOW)).some((item) => item.id === request.id)).toBe(true);

    await saveResponse("performer-1", request.id, { price: 9000, days: 5, message: "Добрий день, зроблю." });
    const real = (await responsesFor(request)).find((response) => response.performerId === "me-performer-1");
    expect(real).toMatchObject({ name: "Іван", price: 9000, days: 5, cityName: "Київ", tier: 1, promoted: false });
    expect(real?.photo).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("умови запиту словами", () => {
  it("бюджет, термін і місто чипами; порожнє не показуємо", async () => {
    const { requestFacts } = await import("@/lib/requests/format");
    expect(requestFacts({ budget: 15000, deadline: "week", cityId: "lviv" })).toEqual([expect.stringMatching(/^до 15\D000 ₴$/), "Протягом тижня", "Львів"]);
    expect(requestFacts({ budget: null, deadline: null, cityId: null })).toEqual([]);
    expect(requestFacts({})).toEqual([]);
  });
});

describe("запити на карті", () => {
  const NOW2 = Date.parse("2026-10-03T12:00:00Z");

  it("гостю видно запити лише з містом і текстом: без акаунта, збігів і відгуків", async () => {
    const { mapRequests } = await import("@/lib/feed/mock-feed");
    const items = await mapRequests(null, [], NOW2 + 600_000);
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((item) => item.matchedTags === 0 && item.response === null && !item.own)).toBe(true);
    // Є і з точкою в місті, і віддалені без точки.
    expect(items.some((item) => item.point)).toBe(true);
    expect(items.some((item) => item.place === "Віддалено" && item.point === null)).toBe(true);
  });

  it("точка поруч із центром міста, стабільна й різна для різних запитів", async () => {
    const { mapRequests } = await import("@/lib/feed/mock-feed");
    const { CITIES } = await import("@/lib/map/cities");
    const items = await mapRequests(null, [], NOW2 + 600_000);
    const lviv = CITIES.find((city) => city.id === "lviv")!;
    const placed = items.find((item) => item.place === "Львів")!;
    expect(Math.hypot(placed.point!.lat - lviv.lat, (placed.point!.lng - lviv.lng) * 0.65)).toBeLessThan(0.1);
    expect((await mapRequests(null, [], NOW2 + 600_000)).find((item) => item.id === placed.id)!.point).toEqual(placed.point);
  });

  it("виконавцю додаємо збіг і його відгук, а власний запит позначено own", async () => {
    const { mapRequests } = await import("@/lib/feed/mock-feed");
    const { createRequest } = await import("@/lib/server/request-repo");
    await createRequest("map-owner", { text: "Потрібен лендинг", tags: [{ id: "landing", label: "Лендинг" }], files: [], cityId: "kyiv" });
    await saveResponse("map-perf", "demo-1", { price: 1000, days: 3, message: "Добрий день, зроблю." });
    const items = await mapRequests("map-perf", ["online-store", "cart-checkout"], NOW2 + 600_000);
    expect(items.find((item) => item.id === "demo-1")).toMatchObject({ matchedTags: 2, response: { price: 1000 } });
    const own = (await mapRequests("map-owner", [], NOW2 + 600_000)).find((item) => item.own);
    expect(own).toMatchObject({ own: true, place: "Київ" });
    expect((await mapRequests("map-perf", [], NOW2 + 600_000)).some((item) => item.own)).toBe(false);
  });
});
