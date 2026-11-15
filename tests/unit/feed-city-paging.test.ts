import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { feedPage, mapRequests } from "@/lib/feed/feed";
import { applyRequestFilter } from "@/lib/feed/map-requests";
import { FEED_PAGE, compareRank, encodeCursor, pageAfter, parseCursor, type RankKey } from "@/lib/feed/rank";
import type { MapRequest } from "@/lib/feed/types";
import { BASE_MATCH, DEFAULT_PREFS, mergePrefs, parsePrefs } from "@/lib/notification-prefs";
import { FEED_JITTER_MS, eventDelay } from "@/lib/realtime/client";
import { MATCH_NOTIFY_MAX, cityAllowed, pickMatching, type MatchCandidate } from "@/lib/server/notify-matching";
import { createRequest } from "@/lib/server/request-repo";
import { MATCH_THRESHOLD } from "@/lib/tags/match";
import { makeUser, useTestD1 } from "../helpers/d1";

const key = (id: string, extra: Partial<RankKey> = {}): RankKey => ({ id, matched: 1, city: false, createdAt: 1000, ...extra });

describe("порядок стрічки: місто", () => {
  it("за однакового покриття тегів запит із міста виконавця вище, навіть старіший", () => {
    const sorted = [key("far", { createdAt: 2000 }), key("near", { city: true, createdAt: 1000 })].sort(compareRank);
    expect(sorted.map((item) => item.id)).toEqual(["near", "far"]);
  });

  it("покриття тегів важливіше за місто", () => {
    const sorted = [key("near", { city: true, matched: 1 }), key("better", { matched: 2 })].sort(compareRank);
    expect(sorted.map((item) => item.id)).toEqual(["better", "near"]);
  });
});

describe("курсор стрічки", () => {
  const all = Array.from({ length: 23 }, (_, index) => key(`req_${String(index).padStart(2, "0")}`, { createdAt: index % 3 === 0 ? 5000 : 4000, matched: index % 2 })).sort(compareRank);

  it("сторінки йдуть без дублів і пропусків, і за однакового часу", () => {
    const seen: string[] = [];
    let page = pageAfter(all, null, 5);
    seen.push(...page.items.map((item) => item.id));
    while (page.next) {
      page = pageAfter(all, parseCursor(page.next), 5);
      seen.push(...page.items.map((item) => item.id));
    }
    expect(seen).toEqual(all.map((item) => item.id));
    expect(new Set(seen).size).toBe(all.length);
  });

  it("остання сторінка не має next; кругообіг курсора без втрат; сміття дає першу сторінку", () => {
    expect(pageAfter(all, null, 100).next).toBeNull();
    const cursor = encodeCursor(all[4]);
    expect(parseCursor(cursor)).toEqual(all[4]);
    expect(parseCursor("junk")).toBeNull();
    expect(parseCursor(null)).toBeNull();
    expect(pageAfter(all, parseCursor("junk"), 3).items.map((item) => item.id)).toEqual(all.slice(0, 3).map((item) => item.id));
  });
});

describe("фільтр «Моє місто»", () => {
  const item = (id: string, extra: Partial<MapRequest>) => ({ id, tags: [], matchedTags: 0, sameCity: false, own: false, deadline: null, budget: null, remote: false, ...extra }) as unknown as MapRequest;

  it("лишає лише запити з міста виконавця й не свої", () => {
    const list = [item("a", { sameCity: true }), item("b", {}), item("mine", { sameCity: true, own: true })];
    expect(applyRequestFilter(list, "city").map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("затримка перечитування за подією", () => {
  it("feed: випадково від 0 до 5 с, решта: коротка фіксована", () => {
    expect(eventDelay("feed", () => 0)).toBe(0);
    expect(eventDelay("feed", () => 0.5)).toBe(FEED_JITTER_MS / 2);
    expect(eventDelay("feed", () => 0.9999)).toBeLessThan(FEED_JITTER_MS);
    expect(eventDelay("message", () => 0.9)).toBe(120);
  });
});

describe("налаштування підбору: типові значення не міняють поведінку", () => {
  it("BASE_MATCH дорівнює порогу підбору, типові: поріг, без бюджету, вся Україна", () => {
    expect(BASE_MATCH).toBe(MATCH_THRESHOLD);
    expect(DEFAULT_PREFS.matching).toEqual({ minMatch: MATCH_THRESHOLD, minBudget: 0, area: "all", cityIds: [] });
  });

  it("старе збережене без matching читається з типовими; сміття й чужі міста відкидаються", () => {
    expect(parsePrefs({ channels: { email: false } }).matching).toEqual(DEFAULT_PREFS.matching);
    const next = mergePrefs(DEFAULT_PREFS, { matching: { minMatch: 0.3, minBudget: -5, area: "mars", cityIds: ["kyiv", "atlantis", 7] } });
    expect(next.matching).toEqual({ minMatch: 0.6, minBudget: 0, area: "all", cityIds: ["kyiv"] });
    expect(mergePrefs(DEFAULT_PREFS, { matching: { minMatch: 1, minBudget: 5000.4, area: "chosen" } }).matching).toMatchObject({ minMatch: 1, minBudget: 5000, area: "chosen" });
  });
});

describe("кому слати: налаштування й місто", () => {
  const prefs = (matching: Partial<typeof DEFAULT_PREFS.matching>, matchingKind = true) => ({ kinds: { ...DEFAULT_PREFS.kinds, matching: matchingKind }, matching: { ...DEFAULT_PREFS.matching, ...matching } });
  const request = { tags: ["telegram-bot"], cityId: "lviv", budget: 5000 };
  const base = (extra: Partial<MatchCandidate> = {}): MatchCandidate => ({ tags: ["telegram-bot"], cityId: "kyiv", ...extra });

  it("без налаштувань і з типовими: як раніше, поріг і місто нікого не відсіюють", () => {
    const profiles = new Map([["a", base()], ["b", base({ prefs: prefs({}) })]]);
    expect(pickMatching(request, profiles, "author")).toEqual(["a", "b"]);
  });

  it("свій виконавець із того ж міста першим за однакового збігу", () => {
    const profiles = new Map([["a", base()], ["z", base({ cityId: "lviv" })]]);
    expect(pickMatching(request, profiles, "author")).toEqual(["z", "a"]);
  });

  it("поріг збігу: батьківський тег проходить 0,6, але не 1", () => {
    const profiles = new Map([["parent", base({ tags: ["chat-bot"], prefs: prefs({ minMatch: 1 }) })], ["exact", base({ prefs: prefs({ minMatch: 1 }) })], ["loose", base({ tags: ["chat-bot"], prefs: prefs({}) })]]);
    expect(pickMatching(request, profiles, "author").sort()).toEqual(["exact", "loose"]);
  });

  it("мінімальний бюджет: нижчий відсіюється, запит без бюджету лишається", () => {
    const profiles = new Map([["picky", base({ prefs: prefs({ minBudget: 10_000 }) })], ["ok", base({ prefs: prefs({ minBudget: 3000 }) })]]);
    expect(pickMatching(request, profiles, "author")).toEqual(["ok"]);
    expect(pickMatching({ ...request, budget: null }, profiles, "author").sort()).toEqual(["ok", "picky"]);
  });

  it("міста: своє, вибрані, уся Україна; «Віддалено» проходить усюди", () => {
    const own = prefs({ area: "own" });
    const chosen = prefs({ area: "chosen", cityIds: ["lviv"] });
    const profiles = new Map([["kyiv-own", base({ prefs: own })], ["lviv-own", base({ cityId: "lviv", prefs: own })], ["kyiv-chosen-lviv", base({ prefs: chosen })], ["kyiv-chosen-odesa", base({ prefs: prefs({ area: "chosen", cityIds: ["odesa"] }) })]]);
    expect(pickMatching(request, profiles, "author").sort()).toEqual(["kyiv-chosen-lviv", "lviv-own"]);
    expect(pickMatching({ ...request, cityId: null }, profiles, "author")).toHaveLength(4);
    expect(cityAllowed({ ...DEFAULT_PREFS.matching, area: "own" }, undefined, "lviv")).toBe(true);
  });

  it("вимкнений вид сповіщень не займає місце серед MATCH_NOTIFY_MAX", () => {
    const profiles = new Map<string, MatchCandidate>(Array.from({ length: MATCH_NOTIFY_MAX + 5 }, (_, index) => [`p${String(index).padStart(2, "0")}`, base({ prefs: prefs({}, index >= 5) })]));
    const picked = pickMatching(request, profiles, "author");
    expect(picked).toHaveLength(MATCH_NOTIFY_MAX);
    expect(picked).not.toContain("p00");
  });
});

describe("стрічка з бази: курсор і місто", () => {
  let ctx: Awaited<ReturnType<typeof useTestD1>>;
  beforeAll(async () => {
    ctx = await useTestD1();
    for (const id of ["pg-cust", "pg-viewer"]) await makeUser(ctx.db, id);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("запит із міста виконавця вище за однакове покриття; більш ніж 200 запитів, сторінки без дублів і пропусків", async () => {
    const tags = [{ id: "telegram-bot", label: "Telegram-бот" }];
    const created: string[] = [];
    for (let index = 0; index < 230; index += 1) {
      const request = await createRequest("pg-cust", { text: `Запит номер ${index}`, tags, files: [], cityId: index === 3 ? "lviv" : "kyiv" });
      created.push(request.id);
    }
    // Багато запитів створено в ту саму мілісекунду: порядок усе одно стабільний.
    const viewer = { tags: ["telegram-bot"], cityId: "lviv" };
    const first = await feedPage("pg-viewer", { viewer });
    expect(first.total).toBe(230);
    expect(first.items).toHaveLength(FEED_PAGE);
    expect(first.items[0].id).toBe(created[3]);
    expect(first.items[0].sameCity).toBe(true);

    const seen = first.items.map((item) => item.id);
    let next = first.next;
    while (next) {
      const page = await feedPage("pg-viewer", { viewer, cursor: next });
      seen.push(...page.items.map((item) => item.id));
      next = page.next;
    }
    expect(seen).toHaveLength(230);
    expect(new Set(seen).size).toBe(230);
    expect(new Set(seen)).toEqual(new Set(created));

    // Без міста в профілі той самий запит не піднімається.
    const plain = await feedPage("pg-viewer", { viewer: { tags: ["telegram-bot"], cityId: null } });
    expect(plain.items.some((item) => item.sameCity)).toBe(false);
  });

  it("карта віддає найновіші чужі запити зі стелею й власні відкриті", async () => {
    const own = await createRequest("pg-viewer", { text: "Мій запит", tags: [], files: [] });
    await createRequest("pg-cust", { text: "Новий у Львові", tags: [], files: [], cityId: "lviv" });
    const items = await mapRequests("pg-viewer", { tags: [], cityId: "lviv" });
    expect(items.filter((item) => !item.own)).toHaveLength(200);
    expect(items.find((item) => item.id === own.id)?.own).toBe(true);
    expect(items.some((item) => item.sameCity)).toBe(true);
  });
});
