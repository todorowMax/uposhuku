import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allReportQueries, funnelSql, insertEvents, logEvent, sqlString, type EventRow, type KitServerConfig } from "@/kit/telemetry/core";
import { CUSTOMER_FUNNEL, PERFORMER_FUNNEL, customerFunnelSql, performerFunnelSql } from "@/lib/telemetry/reports";
import { ALLOWED_EVENTS } from "@/lib/telemetry/events";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const config = (): KitServerConfig => ({ app: "t", env: "development", release: "r1", db: () => ctx.telemetry, userId: async () => null, salt: "s" });
const row = (id: string, name: string, person: string, extra: Partial<EventRow> = {}): EventRow => ({
  id, ts: Date.now(), name, props: null, source: "client", userId: null, anonId: null, sessionId: person, path: "/", referrer: null,
  utmSource: null, utmMedium: null, utmCampaign: null, device: "desktop", browser: "Chrome", os: "macOS", country: "UA", internal: false, ...extra,
});
const all = async (sql: string) => (await ctx.telemetry.prepare(sql).all<Record<string, unknown>>()).results;

describe("SQL звітів", () => {
  it("кожен звіт виконується на справжній базі", async () => {
    for (const [name, sql] of Object.entries(allReportQueries())) await expect(all(sql), name).resolves.toBeDefined();
    await expect(all(customerFunnelSql())).resolves.toHaveLength(CUSTOMER_FUNNEL.length);
    await expect(all(performerFunnelSql())).resolves.toHaveLength(PERFORMER_FUNNEL.length);
  });

  it("воронка рахує людей на кроці й не рахує свої сесії", async () => {
    await insertEvents(ctx.telemetry, [
      row("evt-r-000001", "page_view", "p1"), row("evt-r-000002", "page_view", "p2"), row("evt-r-000003", "page_view", "p3", { internal: true }),
      row("evt-r-000004", "map_ready", "p1"), row("evt-r-000005", "map_ready", "p1"),
    ]);
    const result = await all(funnelSql(["page_view", "map_ready", "request_published"], 1));
    expect(result.map((step) => step.people)).toEqual([2, 1, 0]);
  });

  it("людина із акаунтом і гість на одному кроці — різні люди, але user_id склеює пристрої", async () => {
    await insertEvents(ctx.telemetry, [row("evt-r-000010", "tag_added", "s1", { userId: "u9" }), row("evt-r-000011", "tag_added", "s2", { userId: "u9" })]);
    const result = await all(funnelSql(["tag_added"], 1));
    expect(result[0].people).toBe(1);
  });

  it("errors показує відкриті групи", async () => {
    await logEvent(config(), { level: "error", source: "server", event: "report_probe", message: "probe 1" });
    const errors = await all(allReportQueries().errors);
    expect(errors.some((item) => item.event === "report_probe")).toBe(true);
  });

  it("sqlString екранує лапки", () => {
    expect(sqlString("o'k")).toBe("'o''k'");
  });

  it("усі кроки воронок є в словнику подій", () => {
    for (const step of [...CUSTOMER_FUNNEL, ...PERFORMER_FUNNEL]) expect(ALLOWED_EVENTS.has(step), step).toBe(true);
  });
});
