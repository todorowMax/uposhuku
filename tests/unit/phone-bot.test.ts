// Бот і API телефона: вебхук (контакт свій / чужий / без user_id / з групи), старт з сайту, стан, ніяких номерів у журналі.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
const logs = vi.hoisted(() => ({ calls: [] as unknown[], pushes: [] as unknown[] }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: (input: unknown) => void logs.calls.push(input), logServerError: vi.fn(), serverEvent: (...args: unknown[]) => void logs.calls.push(args) }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: (...args: unknown[]) => void logs.pushes.push(args), pushGlobal: vi.fn(), userOfPerformer: () => null }));

import { GET as STATUS } from "@/app/api/phone/route";
import { POST as START } from "@/app/api/phone/start/route";
import { POST as webhook } from "@/app/api/telegram/webhook/route";
import { telegramLinks, telegramLinkTokens, telegramUpdates, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { phoneHash } from "@/lib/phone/hash";
import { getDb } from "@/lib/server/db";
import { createLinkToken } from "@/lib/server/telegram-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

const SECRET = "test-secret-0123456789";
const KEY = "test-phone-key";
const CHAT = 7001;
let ctx: Awaited<ReturnType<typeof useTestD1>>;
let calls: { method: string; body: Record<string, unknown> }[] = [];
let updateId = 100;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pb-me", "pb-other", "pb-nolink"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  calls = [];
  logs.calls = [];
  logs.pushes = [];
  process.env.TELEGRAM_BOT_TOKEN = "123456:SECRET-BOT-TOKEN";
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_USERNAME = "findlyfy_test_bot";
  process.env.SITE_URL = "https://site.test";
  process.env.PHONE_HASH_KEY = KEY;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: url.split("/").pop() ?? "", body: JSON.parse(String(init.body)) });
      return Response.json({ ok: true, result: { message_id: 7 } });
    }),
  );
  await getDb().delete(telegramLinks);
  await getDb().delete(telegramLinkTokens);
  await getDb().delete(telegramUpdates);
  await ctx.db.prepare("update users set phone_hash = null, phone_mask = null, phone_verified_at = null").run();
  await getDb().insert(telegramLinks).values({ userId: "pb-me", chatId: String(CHAT), active: true, linkedAt: 1 });
  session.user = { id: "pb-me", email: "pb-me@example.com", name: null };
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_USERNAME", "SITE_URL", "PHONE_HASH_KEY"]) delete process.env[name];
});

const send = (body: unknown) =>
  webhook(new Request("https://site.test/api/telegram/webhook", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET } }));
const contactUpdate = (contact: Record<string, unknown>, over: { chatType?: string; fromId?: number } = {}) => ({
  update_id: ++updateId,
  message: { message_id: updateId, date: 1, chat: { id: CHAT, type: over.chatType ?? "private" }, from: { id: over.fromId ?? CHAT, first_name: "Оля" }, contact },
});
const sent = () => calls.filter((call) => call.method === "sendMessage");
const phoneOf = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0];

describe("вебхук: контакт", () => {
  it("свій контакт (user_id = from.id, номер без плюса) приймається: хеш, маска, зняття клавіатури, подія сайту", async () => {
    expect((await send(contactUpdate({ phone_number: "380501234567", first_name: "Оля", user_id: CHAT }))).status).toBe(200);
    const user = await phoneOf("pb-me");
    expect(user.phoneHash).toBe(await phoneHash("+380501234567", KEY));
    expect(user.phoneMask).toBe("+380 •• ••• •• 67");
    expect(sent()).toHaveLength(1);
    expect(sent()[0].body.text).toBe("Номер підтверджено. Можна повертатися на сайт.");
    expect(sent()[0].body.reply_markup).toEqual({ remove_keyboard: true });
    expect(logs.pushes).toContainEqual(["pb-me", { t: "phone" }]);
  });

  it("чужий контакт (інший user_id) відхиляється, нічого не записано, кнопка показується знову", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", first_name: "Хтось", user_id: 999 }));
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
    expect(sent()[0].body.text).toBe("Надішліть, будь ласка, свій номер кнопкою «Поділитися номером».");
    expect(JSON.stringify(sent()[0].body.reply_markup)).toContain("request_contact");
    expect(logs.pushes).toHaveLength(0);
  });

  it("контакт без user_id (набраний вручну) відхиляється", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", first_name: "Вручну" }));
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
    expect(sent()[0].body.text).toContain("свій номер");
  });

  it("контакт із групового чату ігнорується мовчки", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }, { chatType: "group" }));
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
    expect(sent()).toHaveLength(0);
  });

  it("чат без прив'язки: нічого не записується", async () => {
    await getDb().delete(telegramLinks);
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    expect(sent()[0].body.text).toContain("ще не підключено");
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
  });

  it("номер уже в іншого живого акаунта: відповідь taken, без запису й без події", async () => {
    await ctx.db.prepare("update users set phone_hash = ? where id = 'pb-other'").bind(await phoneHash("+380501234567", KEY)).run();
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    expect(sent()[0].body.text).toContain("уже прив'язано до іншого акаунта");
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
    expect(logs.pushes).toHaveLength(0);
    await ctx.db.prepare("update users set phone_hash = null where id = 'pb-other'").run();
  });

  it("уже підтверджений інший номер: бот відповідає locked, нічого не міняє", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    calls = [];
    await send(contactUpdate({ phone_number: "+380671112233", user_id: CHAT }));
    expect(sent()[0].body.text).toBe("Номер уже підтверджено. Щоб змінити його, напишіть нам.");
    expect((await phoneOf("pb-me")).phoneHash).toBe(await phoneHash("+380501234567", KEY));
  });

  it("POST /api/phone/start для підтвердженого: 409 з тим самим текстом, бот нічого не шле", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    calls = [];
    const response = await START();
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("Щоб змінити його, напишіть нам.");
    expect(sent()).toHaveLength(0);
  });

  it("без ключа хешу: відповідь «спробуйте пізніше», нічого не записано", async () => {
    delete process.env.PHONE_HASH_KEY;
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    expect(sent()[0].body.text).toBe("Не вдалося підтвердити номер, спробуйте пізніше.");
    expect((await phoneOf("pb-me")).phoneHash).toBeNull();
  });

  it("номер не потрапляє в журнал ні при успіху, ні при відмові", async () => {
    await send(contactUpdate({ phone_number: "+380501234567", user_id: 999 }));
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    const dump = JSON.stringify(logs.calls) + JSON.stringify(logs.pushes);
    expect(dump).not.toContain("501234567");
  });
});

describe("вебхук: прив'язка з призначенням phone", () => {
  it("після Start за таким токеном бот одразу просить контакт кнопкою", async () => {
    await getDb().delete(telegramLinks);
    const { token } = await createLinkToken("pb-me", Date.now(), "phone");
    await send({ update_id: ++updateId, message: { message_id: 1, date: 1, chat: { id: CHAT, type: "private" }, from: { id: CHAT, first_name: "Оля" }, text: `/start ${token}` } });
    const texts = sent().map((call) => call.body.text);
    expect(texts).toHaveLength(2);
    expect(texts[1]).toBe("Щоб підтвердити телефон для Findlyfy, натисніть кнопку нижче.");
    expect(sent()[1].body.reply_markup).toEqual({ keyboard: [[{ text: "Поділитися номером", request_contact: true }]], one_time_keyboard: true, resize_keyboard: true });
  });

  it("звичайний токен прив'язки кнопку номера не показує", async () => {
    await getDb().delete(telegramLinks);
    const { token } = await createLinkToken("pb-me");
    await send({ update_id: ++updateId, message: { message_id: 1, date: 1, chat: { id: CHAT, type: "private" }, from: { id: CHAT }, text: `/start ${token}` } });
    expect(sent()).toHaveLength(1);
  });
});

describe("POST /api/phone/start і GET /api/phone", () => {
  it("Telegram підключено: бот пише в чат із кнопкою, відповідь має посилання на бота", async () => {
    const response = await START();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ started: true, botUrl: "https://t.me/findlyfy_test_bot" });
    expect(sent()[0].body).toMatchObject({ chat_id: String(CHAT), text: "Щоб підтвердити телефон для Findlyfy, натисніть кнопку нижче." });
    expect(JSON.stringify(sent()[0].body.reply_markup)).toContain('"request_contact":true');
  });

  it("Telegram не підключено: токен із призначенням phone й deep link", async () => {
    await getDb().delete(telegramLinks);
    const body = (await (await START()).json()) as { started: boolean; linkUrl: string };
    expect(body.started).toBe(false);
    expect(body.linkUrl).toMatch(/^https:\/\/t\.me\/findlyfy_test_bot\?start=[A-Za-z0-9_-]{20,}$/);
    expect(sent()).toHaveLength(0);
    expect((await getDb().select().from(telegramLinkTokens))[0].purpose).toBe("phone");
  });

  it("без ключа хешу 503 із записом phone_hash_key_missing, без входу 401", async () => {
    delete process.env.PHONE_HASH_KEY;
    expect((await START()).status).toBe(503);
    expect(JSON.stringify(logs.calls)).toContain("phone_hash_key_missing");
    session.user = null;
    expect((await START()).status).toBe(401);
    expect((await STATUS()).status).toBe(401);
  });

  it("GET: required за прапорцем і наявністю номера, маска й дата після підтвердження", async () => {
    process.env.PHONE_VERIFY_MODE = "allowlist";
    process.env.PHONE_VERIFY_USERS = "pb-me@example.com";
    expect(await (await STATUS()).json()).toEqual({ required: true, verified: false, mask: null, verifiedAt: null });
    await send(contactUpdate({ phone_number: "+380501234567", user_id: CHAT }));
    const after = (await (await STATUS()).json()) as { required: boolean; verified: boolean; mask: string; verifiedAt: number };
    expect(after).toMatchObject({ required: false, verified: true, mask: "+380 •• ••• •• 67" });
    expect(after.verifiedAt).toBeGreaterThan(0);
    delete process.env.PHONE_VERIFY_MODE;
    delete process.env.PHONE_VERIFY_USERS;
  });
});
