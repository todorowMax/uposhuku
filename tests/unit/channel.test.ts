import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { channelPosts } from "@/db/schema";
import { POST as tick } from "@/app/api/internal/tick/route";
import { GET as channelStatus } from "@/app/api/channel/route";
import { POSTS_PER_RUN, POSTS_PER_USER_PER_DAY, closeFinishedPosts, formatChannelPost, hashtag, postDueRequests, restoreReopenedPosts, syncEditedPosts, type ChannelRequest } from "@/lib/telegram/channel";
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

const addRequest = async (id: string, extra: { user?: string; ageMin?: number; optIn?: boolean; status?: string; text?: string; tags?: [string, string][]; budget?: number | null; city?: string | null; deadlineDate?: string | null } = {}) => {
  await ctx.db
    .prepare("insert into requests (id, user_id, text, budget, deadline, deadline_date, city_id, status, channel_opt_in, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, extra.user ?? "a", extra.text ?? "Потрібен Telegram-бот для запису клієнтів", extra.budget ?? 15000, "Протягом тижня", extra.deadlineDate ?? null, extra.city === undefined ? "lviv" : extra.city, extra.status ?? "open", extra.optIn === false ? 0 : 1, NOW - (extra.ageMin ?? 30) * MIN)
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
    expect(button).toEqual({ text: "Відгукнутися на Findlyfy", path: "/zapyt/r1?utm_source=telegram&utm_medium=channel" });
  });

  it("термін у пості: своя дата замість готового строку; рік лише коли він не поточний", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    expect(formatChannelPost({ ...request, deadline: "week", deadlineDate: null }, { now }).html).toContain("⏱ Протягом тижня");
    expect(formatChannelPost({ ...request, deadline: "week", deadlineDate: "2026-11-25" }, { now }).html).toContain("⏱ До 25 листопада");
    expect(formatChannelPost({ ...request, deadline: "week", deadlineDate: "2027-02-01" }, { now }).html).toContain("⏱ До 1 лютого 2027 р.");
    expect(formatChannelPost({ ...request, deadline: null, deadlineDate: null }, { now }).html).not.toContain("⏱");
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

describe("оновлення постів після правки", () => {
  const edits = () => calls.filter((call) => call.method === "editMessageText");
  const editRequest = (id: string, text: string, at: number) => ctx.db.prepare("update requests set text = ?, edited_at = ?, edit_count = edit_count + 1 where id = ?").bind(text, at, id).run();

  it("змінений відкритий запит: пост редагується свіжим текстом із кнопкою, удруге нічого", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    expect(await syncEditedPosts(NOW + MIN)).toBe(0);
    await editRequest("r", "Тепер потрібен сайт-візитка", NOW + 2 * MIN);
    expect(await syncEditedPosts(NOW + 3 * MIN)).toBe(1);
    expect(edits()).toHaveLength(1);
    expect(edits()[0].body).toMatchObject({ chat_id: "-100123", message_id: 42 });
    expect(String(edits()[0].body.text)).toContain("сайт-візитка");
    expect(JSON.stringify(edits()[0].body.reply_markup)).toContain("utm_medium=channel");
    expect(await status("r")).toBe("posted");
    expect(await syncEditedPosts(NOW + 4 * MIN)).toBe(0);
    expect(edits()).toHaveLength(1);
  });

  it("змінена дата терміну оновлює вже опублікований пост: «До …» замість готового строку", async () => {
    const year = new Date().getUTCFullYear();
    await addRequest("d", { deadlineDate: `${year}-12-24` });
    await postDueRequests(NOW);
    expect(String(sent()[0].body.text)).toContain("⏱ До 24 грудня");
    expect(String(sent()[0].body.text)).not.toContain("Протягом тижня");
    await ctx.db.prepare("update requests set deadline_date = ?, edited_at = ?, edit_count = edit_count + 1 where id = 'd'").bind(`${year}-12-30`, NOW + 2 * MIN).run();
    expect(await syncEditedPosts(NOW + 3 * MIN)).toBe(1);
    expect(String(edits()[0].body.text)).toContain("⏱ До 30 грудня");
    expect(String(edits()[0].body.text)).not.toContain("24 грудня");
    // Дату прибрано: пост знову показує готовий строк.
    await ctx.db.prepare("update requests set deadline = 'week', deadline_date = null, edited_at = ?, edit_count = edit_count + 1 where id = 'd'").bind(NOW + 4 * MIN).run();
    expect(await syncEditedPosts(NOW + 5 * MIN)).toBe(1);
    expect(String(edits()[1].body.text)).toContain("⏱ Протягом тижня");
  });

  it("поста ще немає, закритий запит чи запис failed: нічого не редагуємо", async () => {
    await addRequest("fresh", { ageMin: 5 });
    await editRequest("fresh", "Свіжіша версія", NOW);
    await addRequest("gone");
    await postDueRequests(NOW);
    await editRequest("gone", "Правка закритого", NOW + MIN);
    await ctx.db.prepare("update requests set status = 'closed' where id = 'gone'").run();
    await addRequest("bad", { ageMin: 40 });
    await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values ('bad', '-100123', null, 'failed', ?, ?)").bind(NOW, NOW).run();
    await editRequest("bad", "Правка після відмови", NOW + MIN);
    expect(await syncEditedPosts(NOW + 2 * MIN)).toBe(0);
    expect(edits()).toHaveLength(0);
  });

  it("публікація бере свіжі дані: пост ще не відправлено, а запит уже змінено", async () => {
    await addRequest("late", { ageMin: 30 });
    await editRequest("late", "Текст після правки", NOW - MIN);
    expect((await postDueRequests(NOW)).posted).toBe(1);
    expect(String(sent()[0].body.text)).toContain("Текст після правки");
    expect(await syncEditedPosts(NOW + MIN)).toBe(0);
  });

  it(`не більше ${POSTS_PER_RUN} редагувань за запуск; решта в наступному`, async () => {
    for (let index = 0; index < POSTS_PER_RUN + 2; index++) {
      await addRequest(`e${index}`, { user: ["a", "b", "c"][index % 3], ageMin: 30 + index });
      await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values (?, '-100123', ?, 'posted', ?, ?)").bind(`e${index}`, 100 + index, NOW, NOW).run();
      await editRequest(`e${index}`, `Правка ${index}`, NOW + MIN + index);
    }
    expect(await syncEditedPosts(NOW + 5 * MIN)).toBe(POSTS_PER_RUN);
    expect(await syncEditedPosts(NOW + 6 * MIN)).toBe(2);
    expect(edits()).toHaveLength(POSTS_PER_RUN + 2);
  });

  it("помилка Telegram: журнал і запис оновлено без повтору; 429: зупинка до наступного запуску; без токена нічого", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await editRequest("r", "Нова версія", NOW + MIN);
    respond = (method) => (method === "editMessageText" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" }) : Response.json({ ok: true, result: { message_id: 42 } }));
    expect(await syncEditedPosts(NOW + 2 * MIN)).toBe(0);
    expect(await syncEditedPosts(NOW + 3 * MIN)).toBe(0);
    expect(edits()).toHaveLength(1);

    await editRequest("r", "Ще одна версія", NOW + 4 * MIN);
    respond = () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 30 } });
    expect(await syncEditedPosts(NOW + 5 * MIN)).toBe(0);
    respond = () => Response.json({ ok: true, result: { message_id: 42 } });
    expect(await syncEditedPosts(NOW + 6 * MIN)).toBe(1);

    await editRequest("r", "І ще одна", NOW + 7 * MIN);
    delete process.env.TELEGRAM_BOT_TOKEN;
    const before = edits().length;
    expect(await syncEditedPosts(NOW + 8 * MIN)).toBe(0);
    expect(edits()).toHaveLength(before);
  });
});

describe("повернення постів відновлених запитів", () => {
  const edits = () => calls.filter((call) => call.method === "editMessageText");
  const close = (id: string) => ctx.db.prepare("update requests set status = 'closed' where id = ?").bind(id).run();
  const reopen = (id: string) => ctx.db.prepare("update requests set status = 'open' where id = ?").bind(id).run();
  const insertPost = (id: string, state: string, over: { error?: string | null; messageId?: number | null } = {}) =>
    ctx.db
      .prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at, error) values (?, '-100123', ?, ?, ?, ?, ?)")
      .bind(id, over.messageId === undefined ? 42 : over.messageId, state, NOW, NOW, over.error ?? null)
      .run();
  const errorOf = async (id: string) => (await getDb().select().from(channelPosts)).find((row) => row.requestId === id)?.error;

  it("закритий і знову відкритий запит: пост «Виконавця знайдено» повертається до тексту з кнопкою, статус posted, удруге нічого", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await close("r");
    await closeFinishedPosts(NOW);
    expect(await status("r")).toBe("closed");
    expect(await restoreReopenedPosts(NOW + MIN)).toBe(0);
    await reopen("r");
    expect(await restoreReopenedPosts(NOW + 2 * MIN)).toBe(1);
    expect(edits()).toHaveLength(2);
    const back = edits()[1].body;
    expect(back).toMatchObject({ chat_id: "-100123", message_id: 42 });
    expect(String(back.text)).not.toContain("Виконавця знайдено");
    expect(String(back.text)).toContain("Telegram-бот");
    expect(JSON.stringify(back.reply_markup)).toContain("utm_medium=channel");
    expect(await status("r")).toBe("posted");
    expect(await restoreReopenedPosts(NOW + 3 * MIN)).toBe(0);
    expect(edits()).toHaveLength(2);
  });

  it("помилка колишньої правки не заважає: успішне «Виконавця знайдено» її стирає, і пост після відновлення повертається", async () => {
    await addRequest("r");
    await insertPost("r", "posted", { error: "Bad Request: message is not modified" });
    await close("r");
    expect(await closeFinishedPosts(NOW)).toBe(1);
    expect(await errorOf("r")).toBeNull();
    await reopen("r");
    expect(await restoreReopenedPosts(NOW + MIN)).toBe(1);
    expect(await status("r")).toBe("posted");
  });

  it("закрито, але тік ще не встиг відредагувати пост: нічого зайвого, пост лишається звичайним", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await close("r");
    await reopen("r");
    expect(await closeFinishedPosts(NOW + MIN)).toBe(0);
    expect(await restoreReopenedPosts(NOW + MIN)).toBe(0);
    expect(edits()).toHaveLength(0);
    expect(await status("r")).toBe("posted");
  });

  it("withdrawn, failed, closed із помилкою, без повідомлення й зі знятою галочкою не чіпаємо", async () => {
    const cases = [
      { id: "w", state: "withdrawn", over: {} },
      { id: "f", state: "failed", over: { messageId: null } },
      { id: "ce", state: "closed", over: { error: "Bad Request: message to edit not found" } },
      { id: "nm", state: "closed", over: { messageId: null } },
    ];
    for (const { id, state, over } of cases) {
      await addRequest(id, { user: "b" });
      await insertPost(id, state, over);
    }
    await addRequest("optout", { user: "c", optIn: false });
    await insertPost("optout", "closed");
    expect(await restoreReopenedPosts(NOW)).toBe(0);
    expect(edits()).toHaveLength(0);
    expect(await status("w")).toBe("withdrawn");
    expect(await status("optout")).toBe("closed");
  });

  it(`не більше ${POSTS_PER_RUN} постів за запуск; решта в наступному`, async () => {
    for (let index = 0; index < POSTS_PER_RUN + 2; index++) {
      await addRequest(`p${index}`, { user: ["a", "b", "c"][index % 3] });
      await insertPost(`p${index}`, "closed", { messageId: 100 + index });
    }
    expect(await restoreReopenedPosts(NOW)).toBe(POSTS_PER_RUN);
    expect(await restoreReopenedPosts(NOW + MIN)).toBe(2);
    expect(edits()).toHaveLength(POSTS_PER_RUN + 2);
  });

  it("відмова Telegram (400): рядок позначається помилкою без повтору; тимчасова помилка повторюється; 429 зупиняє крок; без токена нічого", async () => {
    await addRequest("r");
    await insertPost("r", "closed");
    respond = () => Response.json({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" });
    expect(await restoreReopenedPosts(NOW)).toBe(0);
    expect(await status("r")).toBe("closed");
    expect(await errorOf("r")).toContain("message to edit not found");
    expect(await restoreReopenedPosts(NOW + MIN)).toBe(0);
    expect(edits()).toHaveLength(1);

    await addRequest("t", { user: "b" });
    await insertPost("t", "closed", { messageId: 43 });
    await addRequest("t2", { user: "c" });
    await insertPost("t2", "closed", { messageId: 45 });
    respond = () => Response.json({ ok: false, error_code: 502, description: "Bad Gateway" });
    expect(await restoreReopenedPosts(NOW + 2 * MIN)).toBe(0);
    expect(await errorOf("t")).toBeNull();
    respond = () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 30 } });
    const before = edits().length;
    expect(await restoreReopenedPosts(NOW + 3 * MIN)).toBe(0);
    expect(edits()).toHaveLength(before + 1);
    respond = () => Response.json({ ok: true, result: { message_id: 43 } });
    expect(await restoreReopenedPosts(NOW + 4 * MIN)).toBe(2);
    expect(await status("t")).toBe("posted");

    await addRequest("u", { user: "c" });
    await insertPost("u", "closed", { messageId: 44 });
    delete process.env.TELEGRAM_BOT_TOKEN;
    const sentBefore = edits().length;
    expect(await restoreReopenedPosts(NOW + 5 * MIN)).toBe(0);
    expect(edits()).toHaveLength(sentBefore);
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
    expect(body).toMatchObject({ ok: true, posted: 1, failed: 0, removed: 0, closed: 0 });
    expect(await status("live")).toBe("posted");
    await ctx.db.prepare("update requests set channel_opt_in = 0 where id = 'live'").run();
    expect(await (await call("tick-token")).json()).toMatchObject({ ok: true, posted: 0, removed: 1 });
    expect(await status("live")).toBeUndefined();
  });

  it("/api/channel каже, чи канал працює", async () => {
    expect(await (await channelStatus()).json()).toEqual({ enabled: true });
    delete process.env.CHANNEL_ENABLED;
    expect(await (await channelStatus()).json()).toEqual({ enabled: false });
    expect(telegramConfig().channelEnabled).toBe(false);
  });
});
