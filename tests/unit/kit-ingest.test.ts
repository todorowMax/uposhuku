import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashIp, MINUTE, type KitServerConfig } from "@/kit/telemetry/core";
import { createIngestRoute, INGEST_LIMIT } from "@/kit/telemetry/next/ingest-route";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.telemetry.batch(["events", "kit_limits"].map((table) => ctx.telemetry.prepare(`delete from ${table}`)));
});

const config = (over: Partial<KitServerConfig> = {}): KitServerConfig => ({
  app: "test",
  env: "development",
  release: "r1",
  db: () => ctx.telemetry,
  userId: async () => null,
  salt: "salt",
  allowedEvents: new Set(["page_view", "request_published", "tag_added"]),
  ...over,
});

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const post = (body: unknown, headers: Record<string, string> = {}, over?: Partial<KitServerConfig>) =>
  createIngestRoute(config(over)).POST(
    new Request("https://app.test/api/k/e", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", "user-agent": CHROME, "cf-connecting-ip": "9.9.9.9", "cf-ipcountry": "UA", ...headers } })
  );
const event = (n: number, extra: Record<string, unknown> = {}) => ({ id: `evt-${String(n).padStart(6, "0")}`, name: "page_view", ts: Date.now(), sessionId: "sess-123456", path: "/", ...extra });
const all = async () => (await ctx.telemetry.prepare("select * from events order by id").all<Record<string, unknown>>()).results;

describe("роут подій аналітики", () => {
  it("пачка з трьох подій → три рядки; повтор тієї самої пачки нічого не додає", async () => {
    const batch = { sentAt: Date.now(), events: [event(1), event(2), event(3)] };
    expect((await post(batch)).status).toBe(204);
    expect((await post(batch)).status).toBe(204);
    expect(await all()).toHaveLength(3);
  });

  it("пристрій, браузер, країна, реліз; referrer лише домен; utm з пачки", async () => {
    await post({ sentAt: Date.now(), referrer: "https://news.example.com/a/b?x=1", utm: { source: "telegram", medium: "channel" }, events: [event(1, { props: { from: "card" } })] });
    expect((await all())[0]).toMatchObject({ device: "desktop", browser: "Chrome", os: "macOS", country: "UA", release: "r1", referrer: "news.example.com", utm_source: "telegram", utm_medium: "channel", source: "client", props: '{"from":"card"}' });
  });

  it("невідома назва, не зі словника, з поганим id чи без сесії відкидається", async () => {
    await post({ sentAt: Date.now(), events: [event(1, { name: "unknown_event" }), event(2, { name: "Bad Name" }), event(3, { id: "x" }), event(4, { sessionId: "" }), event(5)] });
    expect((await all()).map((row) => row.id)).toEqual(["evt-000005"]);
  });

  it("довгі тексти й об'єкти у властивостях відкидаються", async () => {
    await post({ sentAt: Date.now(), events: [event(1, { props: { note: "я".repeat(500), nested: { a: 1 }, ok: 1 } })] });
    expect(JSON.parse(String((await all())[0].props))).toEqual({ note: "я".repeat(100), ok: 1 });
  });

  it("user_id тільки із сесії, а не з тіла", async () => {
    await post({ sentAt: Date.now(), events: [{ ...event(1), userId: "hacker", user_id: "hacker" }] }, {}, { userId: async () => "u1" });
    await post({ sentAt: Date.now(), events: [{ ...event(2), userId: "hacker" }] });
    expect((await all()).map((row) => row.user_id)).toEqual(["u1", null]);
  });

  it("боти не рахуються", async () => {
    await post({ sentAt: Date.now(), events: [event(1)] }, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" });
    expect(await all()).toHaveLength(0);
  });

  it("час події поправлений на зсув годинника клієнта й обмежений добою", async () => {
    const now = Date.now();
    // Годинник клієнта відстає на годину: подія сталась на 5 с раніше за відправку.
    await post({ sentAt: now - 3_600_000, events: [event(1, { ts: now - 3_600_000 - 5000 }), event(2, { ts: now - 10 * 24 * 3_600_000 }), event(3, { ts: now + 99 * 3_600_000 })] });
    const rows = await all();
    const ts = (id: string) => Number(rows.find((row) => row.id === id)!.ts);
    expect(Math.abs(ts("evt-000001") - (now - 5000))).toBeLessThan(5000);
    expect(ts("evt-000002")).toBeGreaterThanOrEqual(now - 24 * 3_600_000 - 5000);
    expect(ts("evt-000003")).toBeLessThanOrEqual(Date.now() + 61_000);
  });

  it("позначка internal доходить до бази", async () => {
    await post({ sentAt: Date.now(), internal: true, events: [event(1)] });
    expect((await all())[0].internal).toBe(1);
  });

  it("ліміт за адресою: понад 300 подій за 10 хвилин не пишемо", async () => {
    // Лічильник наповнюємо напряму: 12 справжніх пачок по 25 подій були б довгим тестом.
    const key = `ev:ip:${await hashIp("9.9.9.9", "salt")}`;
    const now = Date.now();
    await ctx.telemetry.prepare("insert into kit_limits (key, window, count, updated_at) values (?, ?, ?, ?)").bind(key, Math.floor(now / (10 * MINUTE)), INGEST_LIMIT - 1, now).run();
    await post({ sentAt: now, events: [event(1)] });
    expect(await all()).toHaveLength(1);
    await post({ sentAt: now, events: [event(2)] });
    expect(await all()).toHaveLength(1);
  });

  it("тіло понад 16 КБ — 413; зламаний JSON, порожня пачка, немає бази — 204", async () => {
    expect((await post({ sentAt: Date.now(), events: [event(1, { props: { a: "я".repeat(20_000) } })] })).status).toBe(413);
    expect((await post("{not json")).status).toBe(204);
    expect((await post({ events: [] })).status).toBe(204);
    expect((await post({ events: [event(1)] }, {}, { db: () => null })).status).toBe(204);
    expect(await all()).toHaveLength(0);
  });
});
