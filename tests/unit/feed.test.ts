import { describe, expect, it } from "vitest";
import { feedFor, parseResponse, removeResponse, saveResponse } from "@/lib/feed/mock-feed";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";

const NOW = Date.parse("2026-10-03T10:00:00Z");

describe("стрічка запитів виконавця", () => {
  it("показує лише запити, що закривають хоч один тег профілю", () => {
    const items = feedFor("feed-a", ["telegram-bot", "n8n"], NOW);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.matchedTags > 0)).toBe(true);
    expect(items.flatMap((item) => item.tags).every((tag) => TAGS_BY_ID.has(tag.id))).toBe(true);
    expect(items[0].tags.some((tag) => tag.matched)).toBe(true);
  });

  it("запити «приходять» з часом, а не всі одразу", () => {
    const profile = ["mobile-app", "planner-app"];
    const first = feedFor("feed-b", profile, NOW);
    expect(first.some((item) => item.id === "demo-3")).toBe(false);
    const later = feedFor("feed-b", profile, NOW + 40_000);
    expect(later.some((item) => item.id === "demo-3")).toBe(true);
  });

  it("найвідповідніші першими, серед рівних свіжіші", () => {
    const items = feedFor("feed-c", ["telegram-bot", "online-booking", "monobank", "notifications", "automation", "google-sheets"], NOW + 600_000);
    const counts = items.map((item) => item.matchedTags);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("відгук лишається в запиті, рахується й знімається", () => {
    const tags = ["telegram-bot"];
    const before = feedFor("feed-d", tags, NOW)[0];
    saveResponse("feed-d", before.id, { price: 9000, days: 7, message: "Добрий день, зроблю." });
    const after = feedFor("feed-d", tags, NOW)[0];
    expect(after.response).toMatchObject({ price: 9000, days: 7 });
    expect(after.responses).toBe(before.responses + 1);
    removeResponse("feed-d", before.id);
    expect(feedFor("feed-d", tags, NOW)[0].response).toBeNull();
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
    const { createRequest } = await import("@/lib/requests/mock-store");
    const { saveProfile } = await import("@/lib/profile/mock-store");
    const { responsesFor } = await import("@/lib/requests/mock-responses");
    const { emptyProfile } = await import("@/lib/profile/types");

    const request = createRequest("customer-1", { text: "Потрібен лендинг", tags: [{ id: "landing", label: "Лендинг" }], files: [] });
    saveProfile("performer-1", { ...emptyProfile("Іван"), cityId: "kyiv", specialty: "Розробник сайтів", tags: ["landing", "website"], photo: "data:image/jpeg;base64,AAAA", published: true });
    expect(feedFor("performer-1", ["landing", "website"], NOW).some((item) => item.id === request.id)).toBe(true);

    saveResponse("performer-1", request.id, { price: 9000, days: 5, message: "Добрий день, зроблю." });
    const real = responsesFor(request).find((response) => response.performerId === "me-performer-1");
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
