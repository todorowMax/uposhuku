import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertEvents, type EventRow } from "@/kit/telemetry/core";
import { tagsReport, tagsReportSql, type Runner } from "@/lib/telemetry/tags-report";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const row = (id: string, name: string, session: string, props: EventRow["props"]): EventRow => ({
  id, ts: Date.now(), name, props, source: "client", userId: null, anonId: null, sessionId: session, path: "/", referrer: null,
  utmSource: null, utmMedium: null, utmCampaign: null, device: "desktop", browser: "Chrome", os: "macOS", country: "UA", internal: false,
});

describe("звіт про словник тегів", () => {
  it("SQL усіх розділів виконується на справжніх базах і звіт збирається", async () => {
    await insertEvents(ctx.telemetry, [
      row("evt-t-000001", "tag_search_empty", "s1", { context: "profile", query: "webflow cms" }),
      row("evt-t-000002", "tag_search_empty", "s2", { context: "work", query: "webflow cms" }),
      row("evt-t-000003", "tag_removed", "s1", { context: "profile", tag: "beauty", source: "auto", phrase: "краса" }),
      row("evt-t-000004", "tag_picked", "s1", { context: "profile", tag: "figma", rank: 6, via: "label" }),
      row("evt-t-000005", "tag_picked", "s2", { context: "profile", tag: "figma", rank: 0, via: "label" }),
    ]);
    const sql = tagsReportSql(30);
    const run = async (db: D1Database, query: string) => (await db.prepare(query).all<Record<string, unknown>>()).results;

    expect(await run(ctx.telemetry, sql.emptySearches)).toEqual([{ query: "webflow cms", sessions: 2, contexts: expect.stringContaining("profile") }]);
    expect(await run(ctx.telemetry, sql.falsePositives)).toEqual([{ tag: "beauty", phrase: "краса", removed: 1 }]);
    expect(await run(ctx.telemetry, sql.rankStats)).toEqual([{ avg_rank: 3, picks: 2 }]);
    expect(await run(ctx.telemetry, sql.lowRank)).toEqual([{ tag: "figma", avg_rank: 6, picks: 1 }]);
    // Головна база: таблиці є, даних поки немає.
    expect(await run(ctx.db, sql.proposals)).toEqual([]);
    expect(await run(ctx.db, sql.unknownTerms)).toEqual([]);
  });

  it("форматує markdown з усіма розділами, порожні — із позначкою", () => {
    const empty: Runner = () => [];
    const text = tagsReport({ main: empty, telemetry: (sql) => (sql.includes("AVG(json_extract(props, '$.rank')), 2") ? [{ avg_rank: 1.5, picks: 4 }] : []) }, 30, Date.UTC(2026, 9, 10));
    for (const title of ["## 1.", "## 2.", "## 3.", "## 4.", "## 5."]) expect(text).toContain(title);
    expect(text).toContain("_Порожньо._");
    expect(text).toContain("1.5");
    expect(text).toContain("2026-10-10");
  });
});
