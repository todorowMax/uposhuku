import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { channelPosts } from "@/db/schema";
import { DELETE_WINDOW_MS, POSTS_PER_RUN, WITHDRAWN_POST_HTML, postDueRequests, removeOptedOutPosts, syncEditedPosts } from "@/lib/telegram/channel";
import { getDb } from "@/lib/server/db";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let calls: { method: string; body: Record<string, unknown> }[] = [];
let respond: (method: string) => Response = () => Response.json({ ok: true, result: { message_id: 42 } });

const NOW = Date.UTC(2026, 9, 10, 10, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

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

describe("видалення поста після знятої галочки", () => {
  const deletes = () => calls.filter((call) => call.method === "deleteMessage");
  const edits = () => calls.filter((call) => call.method === "editMessageText");
  const optOut = (id: string) => ctx.db.prepare("update requests set channel_opt_in = 0 where id = ?").bind(id).run();
  const rows = async () => (await getDb().select().from(channelPosts)).map((row) => row.requestId);

  it("галочку знято у відкритого запиту: пост видаляється з каналу, рядок стирається, повторно нічого", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    expect((await removeOptedOutPosts(NOW + MIN)).removed).toBe(1);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].body).toEqual({ chat_id: "-100123", message_id: 42 });
    expect(await rows()).toEqual([]);
    expect((await removeOptedOutPosts(NOW + 2 * MIN)).removed).toBe(0);
    expect(deletes()).toHaveLength(1);
  });

  it("галочку знову ввімкнено: запит іде в звичайну чергу й постить новий пост", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    await removeOptedOutPosts(NOW + MIN);
    await ctx.db.prepare("update requests set channel_opt_in = 1 where id = 'r'").run();
    expect((await postDueRequests(NOW + 2 * MIN)).posted).toBe(1);
    expect(await status("r")).toBe("posted");
  });

  it("не чіпає: галочка ввімкнена, запит закритий (пост «Виконавця знайдено»), поста ще немає, запис failed", async () => {
    await addRequest("on");
    await addRequest("closed", { user: "b" });
    await addRequest("fresh", { user: "c", ageMin: 5, optIn: false });
    await postDueRequests(NOW);
    await addRequest("bad", { ageMin: 40 });
    await ctx.db.prepare("update requests set status = 'closed', channel_opt_in = 0 where id = 'closed'").run();
    await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values ('bad', '-100123', null, 'failed', ?, ?)").bind(NOW, NOW).run();
    await optOut("bad");
    expect((await removeOptedOutPosts(NOW + MIN)).removed).toBe(0);
    expect(deletes()).toHaveLength(0);
    expect(await rows()).toEqual(expect.arrayContaining(["on", "closed", "bad"]));
  });

  it("«повідомлення вже немає» (400): рядок стирається, як після успіху", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    respond = (method) => (method === "deleteMessage" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message to delete not found" }) : Response.json({ ok: true, result: { message_id: 42 } }));
    expect((await removeOptedOutPosts(NOW + MIN)).removed).toBe(1);
    expect(await rows()).toEqual([]);
  });

  it("тимчасова помилка видалення (5xx, мережа) не кидає: рядок лишається з помилкою для повтору, редагування немає, наступний запуск вдалий", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    respond = (method) => (method === "deleteMessage" ? Response.json({ ok: false, error_code: 502, description: "Bad Gateway" }) : Response.json({ ok: true, result: { message_id: 42 } }));
    expect(await removeOptedOutPosts(NOW + MIN)).toEqual({ removed: 0, withdrawn: 0 });
    const [row] = await getDb().select().from(channelPosts);
    expect(row).toMatchObject({ requestId: "r", status: "posted", updatedAt: NOW + MIN });
    expect(row.error).toContain("Bad Gateway");
    expect(edits()).toHaveLength(0);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: url.split("/").pop() ?? "", body: JSON.parse(String(init.body)) });
      throw new TypeError("fetch failed");
    }));
    expect(await removeOptedOutPosts(NOW + 2 * MIN)).toEqual({ removed: 0, withdrawn: 0 });
    expect(await status("r")).toBe("posted");
    expect(edits()).toHaveLength(0);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: url.split("/").pop() ?? "", body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, result: true });
    }));
    expect((await removeOptedOutPosts(NOW + 3 * MIN)).removed).toBe(1);
    expect(await rows()).toEqual([]);
  });

  it("свіжий пост (молодший за 48 годин) видаляється, а не редагується; пост рівно 48 годин уже редагується", async () => {
    await addRequest("fresh");
    await addRequest("edge", { user: "b" });
    for (const [id, messageId] of [["fresh", 11], ["edge", 12]] as const) {
      await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values (?, '-100123', ?, 'posted', ?, ?)").bind(id, messageId, NOW, NOW).run();
      await optOut(id);
    }
    expect(await removeOptedOutPosts(NOW + DELETE_WINDOW_MS - 1)).toEqual({ removed: 2, withdrawn: 0 });
    expect(edits()).toHaveLength(0);
    await addRequest("late", { user: "c" });
    await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values ('late', '-100123', 13, 'posted', ?, ?)").bind(NOW, NOW).run();
    await optOut("late");
    expect(await removeOptedOutPosts(NOW + DELETE_WINDOW_MS)).toEqual({ removed: 0, withdrawn: 1 });
    expect(deletes()).toHaveLength(2);
  });

  it("пост старший за 48 годин: без видалення редагується в нейтральний текст без кнопки, статус withdrawn, далі не чіпається й не постить знову", async () => {
    await addRequest("old", { text: "Потрібен лендінг, цікавить Telegram-бот" });
    await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values ('old', '-100123', 77, 'posted', ?, ?)").bind(NOW - 3 * DAY, NOW - 3 * DAY).run();
    await optOut("old");
    expect(await removeOptedOutPosts(NOW + MIN)).toEqual({ removed: 0, withdrawn: 1 });
    expect(deletes()).toHaveLength(0);
    expect(edits()).toHaveLength(1);
    expect(edits()[0].body).toMatchObject({ chat_id: "-100123", message_id: 77, text: WITHDRAWN_POST_HTML, reply_markup: { inline_keyboard: [] } });
    expect(String(edits()[0].body.text)).toBe("<b>Автор прибрав цей запит</b>");
    expect(await status("old")).toBe("withdrawn");
    const before = calls.length;
    expect(await removeOptedOutPosts(NOW + 2 * MIN)).toEqual({ removed: 0, withdrawn: 0 });
    // Галочку повернули: рядок лишився, тож пост не публікується вдруге й не редагується правкою запиту.
    await ctx.db.prepare("update requests set channel_opt_in = 1, text = 'Нова версія', edited_at = ? where id = 'old'").bind(NOW + 3 * MIN).run();
    expect((await postDueRequests(NOW + 4 * MIN)).posted).toBe(0);
    expect(await syncEditedPosts(NOW + 4 * MIN)).toBe(0);
    expect(calls).toHaveLength(before);
  });

  it("Telegram відмовив видалити (400 «неможливо»): той самий шлях, редагування в нейтральний текст, повторів немає", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    respond = (method) => (method === "deleteMessage" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message can't be deleted" }) : Response.json({ ok: true, result: true }));
    expect(await removeOptedOutPosts(NOW + MIN)).toEqual({ removed: 0, withdrawn: 1 });
    expect(deletes()).toHaveLength(1);
    expect(edits()).toHaveLength(1);
    expect(edits()[0].body.text).toBe(WITHDRAWN_POST_HTML);
    expect(await status("r")).toBe("withdrawn");
    expect(await removeOptedOutPosts(NOW + 2 * MIN)).toEqual({ removed: 0, withdrawn: 0 });
    expect(deletes()).toHaveLength(1);
    expect(edits()).toHaveLength(1);
  });

  it("видалення й редагування відхилені (повідомлення прибрали вручну): помилка в рядку, статус closed, повторів немає", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    respond = (method) =>
      method === "deleteMessage" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message can't be deleted" }) : method === "editMessageText" ? Response.json({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" }) : Response.json({ ok: true, result: true });
    await removeOptedOutPosts(NOW + MIN);
    const [row] = await getDb().select().from(channelPosts);
    expect(row).toMatchObject({ status: "closed", updatedAt: NOW + MIN });
    expect(row.error).toContain("message to edit not found");
    const before = calls.length;
    await removeOptedOutPosts(NOW + 2 * MIN);
    expect(calls).toHaveLength(before);
  });

  it("тимчасова помилка редагування старого поста лишає рядок для повтору; 429 зупиняє крок", async () => {
    await addRequest("old");
    await addRequest("old2", { user: "b" });
    for (const [id, messageId] of [["old", 21], ["old2", 22]] as const) {
      await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values (?, '-100123', ?, 'posted', ?, ?)").bind(id, messageId, NOW - 3 * DAY, NOW - 3 * DAY).run();
      await optOut(id);
    }
    respond = () => Response.json({ ok: false, error_code: 500, description: "Internal Server Error" });
    expect(await removeOptedOutPosts(NOW + MIN)).toEqual({ removed: 0, withdrawn: 0 });
    expect(edits()).toHaveLength(2);
    expect(await status("old")).toBe("posted");
    respond = () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 30 } });
    expect(await removeOptedOutPosts(NOW + 2 * MIN)).toEqual({ removed: 0, withdrawn: 0 });
    expect(edits()).toHaveLength(3);
    respond = () => Response.json({ ok: true, result: true });
    expect(await removeOptedOutPosts(NOW + 3 * MIN)).toEqual({ removed: 0, withdrawn: 2 });
    expect(await removeOptedOutPosts(NOW + 4 * MIN)).toEqual({ removed: 0, withdrawn: 0 });
  });

  it("прибраний (withdrawn) пост рахується в добовому ліміті автора", async () => {
    for (const id of ["w1", "w2", "w3"]) {
      await addRequest(id, { ageMin: 60 });
      await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values (?, '-100123', 1, 'withdrawn', ?, ?)").bind(id, NOW - 30 * MIN, NOW - 30 * MIN).run();
    }
    await addRequest("next", { ageMin: 30 });
    expect((await postDueRequests(NOW)).posted).toBe(0);
    expect(sent()).toHaveLength(0);
  });

  it(`не більше ${POSTS_PER_RUN} за запуск; 429 зупиняє крок; без токена нічого`, async () => {
    for (let index = 0; index < POSTS_PER_RUN + 2; index++) {
      await addRequest(`d${index}`, { user: ["a", "b", "c"][index % 3], optIn: false });
      await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values (?, '-100123', ?, 'posted', ?, ?)").bind(`d${index}`, 100 + index, NOW, NOW).run();
    }
    respond = () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 30 } });
    expect((await removeOptedOutPosts(NOW + MIN)).removed).toBe(0);
    expect(deletes()).toHaveLength(1);
    respond = () => Response.json({ ok: true, result: true });
    expect((await removeOptedOutPosts(NOW + 2 * MIN)).removed).toBe(POSTS_PER_RUN);
    expect((await removeOptedOutPosts(NOW + 3 * MIN)).removed).toBe(2);
    delete process.env.TELEGRAM_BOT_TOKEN;
    await addRequest("late", { optIn: false });
    await ctx.db.prepare("insert into channel_posts (request_id, chat_id, message_id, status, posted_at, updated_at) values ('late', '-100123', 7, 'posted', ?, ?)").bind(NOW, NOW).run();
    const before = deletes().length;
    expect((await removeOptedOutPosts(NOW + 4 * MIN)).removed).toBe(0);
    expect(deletes()).toHaveLength(before);
  });

  it("пост із знятою галочкою не редагується після правки запиту", async () => {
    await addRequest("r");
    await postDueRequests(NOW);
    await optOut("r");
    await ctx.db.prepare("update requests set text = 'Нова версія', edited_at = ? where id = 'r'").bind(NOW + MIN).run();
    expect(await syncEditedPosts(NOW + 2 * MIN)).toBe(0);
  });
});
