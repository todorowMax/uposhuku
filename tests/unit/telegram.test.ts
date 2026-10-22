import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { telegramLinkTokens, telegramLinks, telegramUpdates } from "@/db/schema";
import { POST as webhook } from "@/app/api/telegram/webhook/route";
import { callTelegram, TelegramError } from "@/lib/telegram/api";
import { parseCommand } from "@/lib/telegram/handle-update";
import { botLink, telegramConfig } from "@/lib/telegram/config";
import { escapeHtml, excerpt } from "@/lib/telegram/texts";
import { DEFAULT_PREFS, mergePrefs, parsePrefs } from "@/lib/notification-prefs";
import { getPrefs, hasStoredPrefs, savePrefs } from "@/lib/server/notification-prefs-repo";
import { getDb } from "@/lib/server/db";
import { LINK_TOKEN_TTL_MS, activeLink, consumeLinkToken, createLinkToken, deactivateByChat, deactivateByUser, getLink, seenUpdate } from "@/lib/server/telegram-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

const SECRET = "test-secret-0123456789";
const TOKEN = "123456:SECRET-BOT-TOKEN";
let ctx: Awaited<ReturnType<typeof useTestD1>>;
let calls: { method: string; body: Record<string, unknown>; url: string }[] = [];

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["u1", "u2"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  calls = [];
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_USERNAME = "vibemap_test_bot";
  process.env.SITE_URL = "https://site.test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: url.split("/").pop() ?? "", body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, result: { message_id: 7 } });
    })
  );
  await getDb().delete(telegramLinks);
  await getDb().delete(telegramLinkTokens);
  await getDb().delete(telegramUpdates);
  await ctx.db.prepare("delete from notification_preferences").run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_USERNAME", "SITE_URL"]) delete process.env[name];
});

const update = (id: number, text: string, extra: Record<string, unknown> = {}) => ({ update_id: id, message: { message_id: id, date: 1, chat: { id: 5551, type: "private", ...extra }, from: { id: 5551, first_name: "Оля", username: "olya" }, text } });
const send = (body: unknown, secret: string | null = SECRET) =>
  webhook(new Request("https://site.test/api/telegram/webhook", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) } }));
const sent = () => calls.filter((call) => call.method === "sendMessage");

describe("клієнт Bot API", () => {
  it("звертається на потрібний метод і не вставляє токен у текст помилки", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" })));
    const error = (await callTelegram("sendMessage", { chat_id: 1 }).catch((reason) => reason)) as TelegramError;
    expect(error).toBeInstanceOf(TelegramError);
    expect(error.blocked).toBe(true);
    expect(error.message).not.toContain(TOKEN);
  });

  it("429 віддає retryAfter; мережева помилка — код 0 без адреси з токеном", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 } })));
    expect(((await callTelegram("sendMessage").catch((reason) => reason)) as TelegramError).retryAfter).toBe(3);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`fetch failed https://api.telegram.org/bot${TOKEN}/sendMessage`); }));
    const failed = (await callTelegram("sendMessage").catch((reason) => reason)) as TelegramError;
    expect(failed.code).toBe(0);
    expect(failed.message).not.toContain(TOKEN);
  });

  it("без токена не ходить у мережу", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(callTelegram("getMe")).rejects.toThrow(/вимкнений/);
    expect(calls).toHaveLength(0);
  });
});

describe("конфіг і тексти", () => {
  it("бот увімкнений лише з токеном і секретом; посилання на бота з параметром", () => {
    expect(telegramConfig()).toMatchObject({ enabled: true, username: "vibemap_test_bot", siteUrl: "https://site.test" });
    expect(botLink(telegramConfig(), "abc_-1")).toBe("https://t.me/vibemap_test_bot?start=abc_-1");
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(telegramConfig().enabled).toBe(false);
  });

  it("escapeHtml і excerpt", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(excerpt("раз два три чотири п'ять шість", 14)).toBe("раз два три…");
    expect(excerpt("коротко", 50)).toBe("коротко");
  });

  it("parseCommand розуміє /start із параметром і з іменем бота", () => {
    expect(parseCommand("/start abc")).toEqual({ command: "start", arg: "abc" });
    expect(parseCommand("/start@vibemap_bot abc")).toEqual({ command: "start", arg: "abc" });
    expect(parseCommand("/STOP")).toEqual({ command: "stop", arg: "" });
    expect(parseCommand("привіт")).toBeNull();
  });
});

describe("вебхук", () => {
  it("вимкнений бот — 404, чужий секрет — 401 без тіла й без обробки", async () => {
    expect((await send(update(1, "/start"), "wrong")).status).toBe(401);
    expect((await send(update(2, "/start"), null)).status).toBe(401);
    expect(calls).toHaveLength(0);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await send(update(3, "/start"))).status).toBe(404);
  });

  it("/start без параметра: привітання з кнопкою на сайт", async () => {
    expect((await send(update(10, "/start"))).status).toBe(200);
    expect(sent()).toHaveLength(1);
    expect(String(sent()[0].body.text)).toContain("Привіт");
    expect(JSON.stringify(sent()[0].body.reply_markup)).toContain("https://site.test");
    expect(sent()[0].body.chat_id).toBe("5551");
  });

  it("те саме update_id обробляється раз; зламаний JSON — 200", async () => {
    await send(update(11, "/help"));
    await send(update(11, "/help"));
    expect(sent()).toHaveLength(1);
    expect((await send("{не json")).status).toBe(200);
  });

  it("у групах і каналах бот мовчить", async () => {
    await send(update(12, "/start", { type: "group" }));
    expect(sent()).toHaveLength(0);
  });

  it("/start <токен>: прив'язує акаунт, відповідає, токен одноразовий", async () => {
    const { token } = await createLinkToken("u1");
    await send(update(20, `/start ${token}`));
    expect(await getLink("u1")).toMatchObject({ chatId: "5551", username: "olya", active: true });
    expect(String(sent()[0].body.text)).toContain("акаунт підключено");

    await send(update(21, `/start ${token}`));
    expect(String(sent()[1].body.text)).toContain("застаріло");
  });

  it("/stop вимикає сповіщення, /settings дає посилання лише прив'язаним", async () => {
    await send(update(30, "/settings"));
    expect(String(sent()[0].body.text)).toContain("ще не підключено");
    const { token } = await createLinkToken("u1");
    await consumeLinkToken(token, { chatId: "5551" });
    await send(update(31, "/stop"));
    expect((await getLink("u1"))?.active).toBe(false);
    expect(String(sent().at(-1)!.body.text)).toContain("вимкнено");
  });

  it("користувач заблокував бота: прив'язка гасне з відміткою", async () => {
    const { token } = await createLinkToken("u1");
    await consumeLinkToken(token, { chatId: "5551" });
    await send({ update_id: 40, my_chat_member: { chat: { id: 5551, type: "private" }, from: { id: 5551 }, date: 1, old_chat_member: { status: "member", user: { id: 1 } }, new_chat_member: { status: "kicked", user: { id: 1 } } } });
    const link = await getLink("u1");
    expect(link?.active).toBe(false);
    expect(link?.blockedAt).not.toBeNull();
  });

  it("помилка Telegram 403 на відповіді вимикає прив'язку, а не ламає вебхук", async () => {
    const { token } = await createLinkToken("u1");
    await consumeLinkToken(token, { chatId: "5551" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" })));
    expect((await send(update(50, "/help"))).status).toBe(200);
    expect((await getLink("u1"))?.active).toBe(false);
  });
});

describe("прив'язка акаунта", () => {
  it("токен живе 15 хвилин і одноразовий; чужий і кривий не підходять", async () => {
    const { token, expiresAt } = await createLinkToken("u1", 1_000);
    expect(expiresAt).toBe(1_000 + LINK_TOKEN_TTL_MS);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await consumeLinkToken(token, { chatId: "1" }, 1_000 + LINK_TOKEN_TTL_MS + 1)).toEqual({ ok: false });
    const fresh = await createLinkToken("u1");
    expect(await consumeLinkToken("не-токен", { chatId: "1" })).toEqual({ ok: false });
    expect((await consumeLinkToken(fresh.token, { chatId: "1" })).ok).toBe(true);
    expect(await consumeLinkToken(fresh.token, { chatId: "2" })).toEqual({ ok: false });
  });

  it("новий токен гасить попередній невикористаний", async () => {
    const first = await createLinkToken("u1");
    const second = await createLinkToken("u1");
    expect(await consumeLinkToken(first.token, { chatId: "1" })).toEqual({ ok: false });
    expect((await consumeLinkToken(second.token, { chatId: "1" })).ok).toBe(true);
  });

  it("один Telegram — один акаунт: другий акаунт забирає чат у першого", async () => {
    await consumeLinkToken((await createLinkToken("u1")).token, { chatId: "77" });
    const result = await consumeLinkToken((await createLinkToken("u2")).token, { chatId: "77" });
    expect(result).toMatchObject({ ok: true, userId: "u2", replacedOtherAccount: true });
    expect(await getLink("u1")).toBeNull();
    expect((await getLink("u2"))?.chatId).toBe("77");
  });

  it("повторна прив'язка після /stop вмикає знову й знімає блокування", async () => {
    await consumeLinkToken((await createLinkToken("u1")).token, { chatId: "88" });
    await deactivateByChat("88", true);
    expect(await activeLink("u1")).toBeNull();
    await consumeLinkToken((await createLinkToken("u1")).token, { chatId: "88" });
    expect(await activeLink("u1")).toMatchObject({ active: true, blockedAt: null });
  });

  it("відключення з сайту повертає чат; seenUpdate розрізняє повтор", async () => {
    await consumeLinkToken((await createLinkToken("u1")).token, { chatId: "99" });
    expect((await deactivateByUser("u1"))?.chatId).toBe("99");
    expect(await deactivateByUser("u2")).toBeNull();
    expect(await seenUpdate(1234)).toBe(false);
    expect(await seenUpdate(1234)).toBe(true);
  });
});

describe("налаштування сповіщень", () => {
  it("значення за замовчуванням: пошта й Telegram увімкнені, пуш ні, всі види й тихі години", () => {
    expect(DEFAULT_PREFS).toEqual({ channels: { email: true, push: false, telegram: true }, kinds: { offers: true, messages: true, deals: true, matching: true, tags: true }, quietHours: true });
  });

  it("merge бере лише відомі булеві поля; старий плоский формат localStorage переноситься", () => {
    expect(mergePrefs(DEFAULT_PREFS, { channels: { push: true, hacker: true, email: "так" }, kinds: { offers: false }, quietHours: false, extra: 1 })).toEqual({
      channels: { email: true, push: true, telegram: true },
      kinds: { ...DEFAULT_PREFS.kinds, offers: false },
      quietHours: false,
    });
    expect(parsePrefs({ email: false, push: true, telegram: false }).channels).toEqual({ email: false, push: true, telegram: false });
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it("зберігається часткове оновлення й зливається; без рядка — типові", async () => {
    expect(await getPrefs("u1")).toEqual(DEFAULT_PREFS);
    expect(await hasStoredPrefs("u1")).toBe(false);
    await savePrefs("u1", { kinds: { matching: false } });
    const second = await savePrefs("u1", { channels: { telegram: false } });
    expect(second.kinds.matching).toBe(false);
    expect(second.channels.telegram).toBe(false);
    expect(await getPrefs("u1")).toEqual(second);
    expect(await hasStoredPrefs("u1")).toBe(true);
    expect(await getPrefs("u2")).toEqual(DEFAULT_PREFS);
  });
});
