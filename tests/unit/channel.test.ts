import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { channelPosts } from "@/db/schema";
import { POST as tick } from "@/app/api/internal/tick/route";
import { GET as channelStatus } from "@/app/api/channel/route";
import { POSTS_PER_USER_PER_DAY, closeFinishedPosts, formatChannelPost, hashtag, postDueRequests, type ChannelRequest } from "@/lib/telegram/channel";
import { telegramConfig } from "@/lib/telegram/config";
import { getDb } from "@/lib/server/db";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let calls: { method: string; body: Record<string, unknown> }[] = [];
let respond: (method: string) => Response = () => Response.json({ ok: true, result: { message_id: 42 } });

const NOW = Date.UTC(2026, 9, 10, 10, 0);
const MIN = 60_000;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["a", "b", "c"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  calls = [];
  respond = () => Response.json({ ok: true, result: { message_id: 42 } });
  Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "1:T", TELEGRAM_WEBHOOK_SECRET: "secret-secret-secret", TELEGRAM_CHANNEL_ID: "-100123", CHANNEL_ENABLED: "1", CHANNEL_DELAY_MIN: "20", SITE_URL: "https://site.test", INTERNAL_TOKEN: "tick-token" });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split("/").pop() ?? "";
    calls.push({ method, body: JSON.parse(String(init.body)) });
    return respond(method);
  }));
  for (const table of ["channel_posts", "request_tags", "requests"]) await ctx.db.prepare(`delete from ${table}`).run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_CHANNEL_ID", "CHANNEL_ENABLED", "CHANNEL_DELAY_MIN", "SITE_URL", "INTERNAL_TOKEN"]) delete process.env[name];
});

const addRequest = async (id: string, extra: { user?: string; ageMin?: number; optIn?: boolean; status?: string; text?: string; tags?: [string, string][]; budget?: number | null; city?: string | null } = {}) => {
  await ctx.db
    .prepare("insert into requests (id, user_id, text, budget, deadline, city_id, status, channel_opt_in, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, extra.user ?? "a", extra.text ?? "Потрібен Telegram-бот для запису клієнтів", extra.budget ?? 15000, "Протягом тижня", extra.city === undefined ? "lviv" : extra.city, extra.status ?? "open", extra.optIn === false ? 0 : 1, NOW - (extra.ageMin ?? 30) * MIN)
    .run();
  for (const [tag, label] of extra.tags ?? [["telegram-bot", "Telegram-бот"]]) await ctx.db.prepare("insert into request_tags (request_id, tag_id, label) values (?, ?, ?)").bind(id, tag, label).run();
};
const sent = () => calls.filter((call) => call.method === "sendMessage");
const status = async (id: string) => (await getDb().select().from(channelPosts)).find((row) => row.requestId === id)?.status;

describe("формат поста", () => {
  const request: ChannelRequest = { id: "r1", text: "Бот <для> мене. Пишіть +380991112233, @nick_name або a@b.com", budget: 15000, deadline: "Протягом тижня", cityId: "lviv", tags: [{ id: "telegram-bot", label: "Telegram-бот" }, { id: "n8n", label: "n8n" }, { id: "x", label: "Запис клієнтів" }, { id: "y", label: "CRM" }, { id: "z", label: "Ще п'ятий" }] };

  it("хештеги: лише літери, цифри й підкреслення; не більше чотирьох", () => {
    expect(hashtag("Telegram-бот")).toBe("#telegram_бот");
    expect(hashtag("Next.js")).toBe("#next_js");
    expect(hashtag("!!!")).toBe("");
    const { html } = formatChannelPost(request);
    expect((html.match(/#/g) ?? []).length).toBe(4);
  });

  it("контакти вирізані, html екранований, факти й кнопка з позначками каналу", () => {
    const { html, button } = formatChannelPost(request);
    expect(html).not.toMatch(/380|nick_name|a@b/);
    expect(html).toContain("[контакт приховано]");
    expect(html).toContain("&lt;для&gt;");
    expect(html).toContain("💰 до 15 000 ₴");
    expect(html).toContain("📍 Львів");
    expect(button).toEqual({ text: "Відгукнутися на Findlyfy", path: "/?open=request%3Ar1&utm_source=telegram&utm_medium=channel" });
  });

  it("довгий текст ріжеться по слову; без міста — «Віддалено»; закритий без кнопки", () => {
    const long = formatChannelPost({ ...request, text: "слово ".repeat(200), cityId: null, budget: null });
    expect(long.html.length).toBeLessThan(700);
    expect(long.html).toContain("…");
    expect(long.html).toContain("📍 Віддалено");
    expect(long.html).not.toContain("💰");
    const closed = formatChannelPost(request, { closed: true });
    expect(closed.html.startsWith("✅ <b>Виконавця знайдено</b>")).toBe(true);
    expect(closed.button).toBeNull();
  });
});

describe("постинг у канал", () => {
  it("постить лише дозрілі, відкриті й дозволені; удруге нічого", async () => {
    await addRequest("ripe", { ageMin: 30 });
    await addRequest("young", { ageMin: 5 });
    await addRequest("optout", { optIn: false });
    await addRequest("closed", { status: "closed" });
    await addRequest("old", { ageMin: 25 * 60 });
    expect(await postDueRequests(NOW)).toEqual({ posted: 1, failed: 0 });
    expect(sent()).toHaveLength(1);
    expect(sent()[0].body).toMatchObject({ chat_id: "-100123", parse_mode: "HTML" });
    expect(JSON.stringify(sent()[0].body.reply_markup)).toContain("utm_medium=channel");
    expect(await status("ripe")).toBe("posted");
    expect(await postDueRequests(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(sent()).toHaveLength(1);
  });

  it("затримка береться з CHANNEL_DELAY_MIN", async () => {
    await addRequest("r", { ageMin: 5 });
    expect((await postDueRequests(NOW)).posted).toBe(0);
    process.env.CHANNEL_DELAY_MIN = "1";
    expect((await postDueRequests(NOW)).posted).toBe(1);
  });

  it("вимкнений канал, немає id каналу чи бота: нічого", async () => {
    await addRequest("r");
    delete process.env.CHANNEL_ENABLED;
    expect(await postDueRequests(NOW)).toEqual({ posted: 0, failed: 0 });
    process.env.CHANNEL_ENABLED = "1";
    delete process.env.TELEGRAM_CHANNEL_ID;
    expect(await postDueRequests(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(calls).toHaveLength(0);
  });

  it(`не більше ${POSTS_PER_USER_PER_DAY} постів від однієї людини за добу, інші не страждають`, async () => {
    for (let index = 0; index < 5; index++) await addRequest(`a${index}`, { user: "a", ageMin: 60 - index });
    await addRequest("b0", { user: "b", ageMin: 25 });
    expect((await postDueRequests(NOW)).posted).toBe(POSTS_PER_USER_PER_DAY + 1);
    expect(await status("b0")).toBe("posted");
    expect(await postDueRequests(NOW + 5 * MIN)).toEqual({ posted: 0, failed: 0 });
  });

  it("відмова Telegram (400): фіксуємо failed без повторів; 429: зупиняємось і не фіксуємо", async () => {
    await addRequest("bad", { ageMin: 60 });
    await addRequest("ok", { ageMin: 50 });
    respond = () => Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" });
    expect(await postDueRequests(NOW)).toEqual({ posted: 0, failed: 2 });
    expect(await status("bad")).toBe("failed");
    expect(await postDueRequests(NOW + MIN)).toEqual({ posted: 0, failed: 0 });

    await ctx.db.prepare("delete from channel_posts").run();
    respond = () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 30 } });
    expect(await postDueRequests(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(await getDb().select().from(channelPosts)).toHaveLength(0);
  });
});

describe("закриття постів", () => {
  it("закритий запит: пост редагується («Виконавця знайдено»), статус closed, удруге нічого", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    expect(await closeFinishedPosts(NOW)).toBe(0);
    await ctx.db.prepare("update requests set status = 'closed' where id = 'r'").run();
    expect(await closeFinishedPosts(NOW)).toBe(1);
    const edit = calls.find((call) => call.method === "editMessageText")!;
    expect(edit.body).toMatchObject({ chat_id: "-100123", message_id: 42 });
    expect(String(edit.body.text)).toContain("Виконавця знайдено");
    expect(await status("r")).toBe("closed");
    expect(await closeFinishedPosts(NOW)).toBe(0);
  });

  it("повідомлення вже видалили (400): закриваємо запис, не повторюємо", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await ctx.db.prepare("update requests set status = 'closed' where id = 'r'").run();
    respond = (method) => (method === "editMessageText" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" }) : Response.json({ ok: true, result: { message_id: 1 } }));
    expect(await closeFinishedPosts(NOW)).toBe(0);
    expect(await status("r")).toBe("closed");
  });
});

describe("cron-роут і статус каналу", () => {
  const call = (token?: string) => tick(new Request("https://site.test/api/internal/tick", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

  it("без токена чи з чужим — 401; зі своїм постить дозрілий запит і повертає лічильники", async () => {
    // Cron працює за справжнім часом, тож запит створюємо відносно нього, а не фіксованого NOW.
    await ctx.db.prepare("insert into requests (id, user_id, text, status, channel_opt_in, created_at) values ('live', 'a', 'Потрібен сайт', 'open', 1, ?)").bind(Date.now() - 30 * MIN).run();
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    expect(calls).toHaveLength(0);
    delete process.env.INTERNAL_TOKEN;
    expect((await call("tick-token")).status).toBe(401);
    process.env.INTERNAL_TOKEN = "tick-token";
    const body = (await (await call("tick-token")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, posted: 1, failed: 0, closed: 0 });
    expect(await status("live")).toBe("posted");
  });

  it("/api/channel каже, чи канал працює", async () => {
    expect(await (await channelStatus()).json()).toEqual({ enabled: true });
    delete process.env.CHANNEL_ENABLED;
    expect(await (await channelStatus()).json()).toEqual({ enabled: false });
    expect(telegramConfig().channelEnabled).toBe(false);
  });
});
