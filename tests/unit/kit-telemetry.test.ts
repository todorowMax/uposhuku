import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fingerprint, forgetUser, hit, HOUR, insertEvents, logEvent, normalizeMessage, parseUserAgent, sanitizeProps, serialize, topFrame, trackServer, type KitServerConfig } from "@/kit/telemetry/core";
import { createReportRoute, REPORT_LIMITS } from "@/kit/telemetry/next/report-route";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const config = (over: Partial<KitServerConfig> = {}): KitServerConfig => ({
  app: "test",
  env: "development",
  release: "abc123",
  db: () => ctx.telemetry,
  userId: async () => null,
  salt: "salt",
  ...over,
});

const rows = async <T,>(sql: string, ...binds: unknown[]) => (await ctx.telemetry.prepare(sql).bind(...binds).all<T>()).results;
const clean = async () => {
  await ctx.telemetry.batch(["logs", "log_issues", "events", "kit_limits"].map((table) => ctx.telemetry.prepare(`delete from ${table}`)));
};

describe("fingerprint", () => {
  it("числа, uuid і довгі hex не відрізняють однакові помилки", async () => {
    const a = await fingerprint({ source: "server", event: "api_error", message: "Запит 123 впав для 8f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8" });
    const b = await fingerprint({ source: "server", event: "api_error", message: "Запит 456 впав для 11111111-2222-3333-4444-555555555555" });
    expect(a).toBe(b);
    expect(await fingerprint({ source: "server", event: "other", message: "Запит 123 впав" })).not.toBe(a);
  });

  it("текст у лапках і шлях адреси не мають значення", () => {
    expect(normalizeMessage('Невідомий тег "abc" на https://x.com/a/b?c=1')).toBe(normalizeMessage("Невідомий тег 'zzz' на https://x.com/q"));
  });

  it("перший кадр стека без хешу збірки", () => {
    const stack = "Error: x\n    at fn (https://app.test/_next/static/chunks/app/page-3f2a1b9c.js:1:2345)\n    at other (https://app.test/b.js:1:1)";
    expect(topFrame(stack)).toBe("fn@/chunks/app/page.js");
    expect(topFrame("run@https://app.test/_next/static/chunks/main-aaaaaaaa11.js:10:5")).toBe("run@/chunks/main.js");
    expect(topFrame(null)).toBe("");
  });
});

describe("serialize", () => {
  it("переживає Error, цикли, bigint і ріже по межі", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(serialize(cyclic)).toContain("циклічне");
    expect(JSON.parse(serialize(new Error("boom"))!)).toMatchObject({ name: "Error", message: "boom" });
    expect(serialize({ n: BigInt(5) })).toBe('{"n":"5"}');
    expect(serialize({ text: "я".repeat(9000) }, 100)!.length).toBe(4000);
    expect(serialize(undefined)).toBeNull();
  });
});

describe("logEvent", () => {
  beforeEach(clean);

  it("пише рядок і групу; та сама помилка двічі — count 2 і один fingerprint", async () => {
    await logEvent(config(), { level: "error", source: "server", event: "api_error", message: "Запит 1 впав", detail: { stack: "Error\n at f (a.js:1:1)" } });
    await logEvent(config(), { level: "error", source: "server", event: "api_error", message: "Запит 2 впав", detail: { stack: "Error\n at f (a.js:1:1)" } });
    const issues = await rows<{ count: number; status: string; last_release: string }>("select count, status, last_release from log_issues");
    expect(issues).toEqual([{ count: 2, status: "open", last_release: "abc123" }]);
    expect(await rows("select id from logs")).toHaveLength(2);
  });

  it("info не потрапляє в групи", async () => {
    await logEvent(config(), { level: "info", source: "worker", event: "my_chat_member", message: "канал" });
    expect(await rows("select id from logs")).toHaveLength(1);
    expect(await rows("select fingerprint from log_issues")).toHaveLength(0);
  });

  it("виправлена помилка після нового випадку знову відкрита, а ігнорована лишається", async () => {
    await logEvent(config(), { level: "error", source: "server", event: "a", message: "m" });
    await logEvent(config(), { level: "error", source: "server", event: "b", message: "m" });
    await ctx.telemetry.prepare("update log_issues set status = 'resolved' where event = 'a'").run();
    await ctx.telemetry.prepare("update log_issues set status = 'ignored' where event = 'b'").run();
    await logEvent(config({ release: "def456" }), { level: "error", source: "server", event: "a", message: "m" });
    await logEvent(config(), { level: "error", source: "server", event: "b", message: "m" });
    expect(await rows("select event, status from log_issues order by event")).toEqual([
      { event: "a", status: "open" },
      { event: "b", status: "ignored" },
    ]);
  });

  it("без бази й з зламаною базою не кидає", async () => {
    await expect(logEvent(config({ db: () => null }), { level: "error", source: "server", event: "x" })).resolves.toBeUndefined();
    await expect(logEvent(config({ db: () => ({}) as D1Database }), { level: "error", source: "server", event: "x" })).resolves.toBeUndefined();
  });

  it("forgetUser обнуляє ідентифікатори", async () => {
    await logEvent(config(), { level: "error", source: "server", event: "x", userId: "u1", anonId: "anon-123456" });
    await forgetUser(ctx.telemetry, "u1");
    expect(await rows("select user_id, anon_id from logs")).toEqual([{ user_id: null, anon_id: null }]);
  });
});

describe("лічильники", () => {
  beforeEach(clean);

  it("hit рахує у вікні й каже, коли ліміт вичерпано", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await hit(ctx.telemetry, "k", HOUR, 3));
    expect(results).toEqual([true, true, true, false]);
    expect(await hit(ctx.telemetry, "other", HOUR, 3)).toBe(true);
  });

  it("hit з n зараховує кілька разом", async () => {
    expect(await hit(ctx.telemetry, "k2", HOUR, 5, 4)).toBe(true);
    expect(await hit(ctx.telemetry, "k2", HOUR, 5, 2)).toBe(false);
  });
});

describe("роут звітів із браузера", () => {
  beforeEach(clean);
  const post = (route: ReturnType<typeof createReportRoute>, body: unknown, headers: Record<string, string> = {}) =>
    route.POST(new Request("https://app.test/api/k/r", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers } }));

  it("гість: пише без user_id, IP не зберігає; user_id з тіла ігнорується", async () => {
    const route = createReportRoute(config());
    const response = await post(route, { event: "unhandled_error", message: "boom", detail: { stack: "x" }, userId: "hacker", route: "/", sessionId: "sess-123456" });
    expect(response.status).toBe(200);
    const [row] = await rows<Record<string, unknown>>("select * from logs");
    expect(row).toMatchObject({ source: "client", event: "unhandled_error", user_id: null, session_id: "sess-123456", release: "abc123" });
    expect(String(row.ip_hash)).toHaveLength(16);
    expect(JSON.stringify(row)).not.toContain("1.2.3.4");
  });

  it("людина із сесією: user_id із сесії", async () => {
    const route = createReportRoute(config({ userId: async () => "u7" }));
    await post(route, { event: "render_error", message: "x" });
    expect(await rows("select user_id from logs")).toEqual([{ user_id: "u7" }]);
  });

  it("невідомий код події стає client_error; рівень лише error чи warn", async () => {
    const route = createReportRoute(config());
    await post(route, { event: "Bad Event!", message: "x", level: "info" });
    await post(route, { event: "ok_event", message: "y", level: "warn" });
    expect(await rows("select event, level from logs order by created_at")).toEqual([
      { event: "client_error", level: "error" },
      { event: "ok_event", level: "warn" },
    ]);
  });

  it("гість: 21-й звіт за годину відсікається", async () => {
    const route = createReportRoute(config());
    const outcomes: unknown[] = [];
    for (let i = 0; i < REPORT_LIMITS.ip + 1; i++) outcomes.push(((await (await post(route, { event: "e", message: `m${i}` })).json()) as { throttled?: boolean }).throttled);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await rows("select id from logs")).toHaveLength(REPORT_LIMITS.ip);
  });

  it("тіло понад 16 КБ — 413, зламаний JSON — 200 без запису", async () => {
    const route = createReportRoute(config());
    expect((await post(route, { message: "я".repeat(20_000) })).status).toBe(413);
    expect((await post(route, "{not json")).status).toBe(200);
    expect(await rows("select id from logs")).toHaveLength(0);
  });

  it("без бази відповідає 200", async () => {
    expect((await post(createReportRoute(config({ db: () => null })), { message: "x" })).status).toBe(200);
  });
});

describe("події", () => {
  beforeEach(clean);

  it("sanitizeProps лишає прості значення й відкидає решту", () => {
    expect(sanitizeProps({ ok: 1, name: "я".repeat(300), flag: true, Bad: 1, nested: { a: 1 }, nan: NaN, list: [1] })).toEqual({ ok: 1, name: "я".repeat(100), flag: true });
    expect(Object.keys(sanitizeProps(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])))!)).toHaveLength(15);
    expect(sanitizeProps("text")).toBeNull();
    expect(sanitizeProps({})).toBeNull();
  });

  it("insertEvents ігнорує повторну відправку того самого id", async () => {
    const event = { id: "evt-000001", ts: Date.now(), name: "page_view", props: { path: "/" }, source: "client" as const, userId: null, anonId: null, sessionId: "sess-123456", path: "/", referrer: null, utmSource: null, utmMedium: null, utmCampaign: null, device: "desktop", browser: "Chrome", os: "macOS", country: "UA", internal: false };
    await insertEvents(ctx.telemetry, [event, { ...event, id: "evt-000002" }]);
    await insertEvents(ctx.telemetry, [event]);
    expect(await rows("select id from events")).toHaveLength(2);
  });

  it("trackServer пише серверну подію зі словника й відкидає чужу назву", async () => {
    const done: Promise<unknown>[] = [];
    const cfg = config({ allowedEvents: new Set(["request_published"]), waitUntil: (work) => void done.push(work) });
    trackServer(cfg, "request_published", { tags: 3, secret: { a: 1 } }, { userId: "u1" });
    trackServer(cfg, "not_in_dictionary", {});
    trackServer(cfg, "Bad Name", {});
    await Promise.all(done);
    expect(await rows("select name, source, user_id, session_id, props from events")).toEqual([{ name: "request_published", source: "server", user_id: "u1", session_id: "server", props: '{"tags":3}' }]);
  });
});

describe("parseUserAgent", () => {
  it("розрізняє пристрої, браузери й ботів", () => {
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile/15E148 Safari/604")).toMatchObject({ device: "mobile", os: "iOS", browser: "Safari", bot: false });
    expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537 Chrome/120 Safari/537 Edg/120")).toMatchObject({ device: "desktop", os: "macOS", browser: "Edge" });
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120 Mobile Safari/537")).toMatchObject({ device: "mobile", os: "Android", browser: "Chrome" });
    expect(parseUserAgent("Googlebot/2.1").bot).toBe(true);
    expect(parseUserAgent(null).bot).toBe(true);
  });
});
