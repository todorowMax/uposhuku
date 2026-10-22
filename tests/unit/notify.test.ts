import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationLog, telegramLinks } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { MATCHING_DAILY_LIMIT, isQuietHour, kyivHour, notifyUser } from "@/lib/server/notify";
import { MATCH_NOTIFY_MAX, pickMatching } from "@/lib/server/notify-matching";
import { savePrefs } from "@/lib/server/notification-prefs-repo";
import { markPresence } from "@/lib/server/presence-sql";
import { consumeLinkToken, createLinkToken, getLink } from "@/lib/server/telegram-repo";
import { DEAL_TEXTS, bucket, dealNotice, deepLink, matchNotice, messageNotice, offerNotice, WINDOW_MS } from "@/lib/telegram/notices";
import { stripContacts } from "@/lib/chat/contacts";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let calls: { body: Record<string, unknown> }[] = [];
let respond: () => Response = () => Response.json({ ok: true, result: { message_id: 1 } });

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["u1", "u2"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  calls = [];
  respond = () => Response.json({ ok: true, result: { message_id: 1 } });
  process.env.TELEGRAM_BOT_TOKEN = "1:TOKEN";
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret-secret-secret";
  process.env.SITE_URL = "https://site.test";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    return respond();
  }));
  for (const table of ["notification_log", "notification_preferences", "telegram_links", "telegram_link_tokens", "presence"]) await ctx.db.prepare(`delete from ${table}`).run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "SITE_URL"]) delete process.env[name];
});

const link = async (userId = "u1") => {
  await consumeLinkToken((await createLinkToken(userId)).token, { chatId: userId === "u1" ? "1001" : "1002" });
};
const notice = (extra: Partial<ReturnType<typeof offerNotice>> = {}) => ({ ...offerNotice({ requestId: "r1", requestText: "Потрібен бот", price: 5000, days: 7 }), ...extra });
const NOON = Date.UTC(2026, 9, 10, 10, 0); // 13:00 у Києві (літній час)
const LATE = Date.UTC(2026, 9, 10, 20, 30); // 23:30 у Києві

describe("тихі години за Києвом", () => {
  it("23:00–08:00 тихі, решта ні; київський час, а не часу сервера", () => {
    expect(kyivHour(NOON)).toBe(13);
    expect(kyivHour(LATE)).toBe(23);
    expect(isQuietHour(NOON)).toBe(false);
    expect(isQuietHour(LATE)).toBe(true);
    expect(isQuietHour(Date.UTC(2026, 9, 10, 4, 59))).toBe(true); // 07:59
    expect(isQuietHour(Date.UTC(2026, 9, 10, 5, 0))).toBe(false); // 08:00
    // Взимку Київ UTC+2.
    expect(kyivHour(Date.UTC(2026, 11, 10, 21, 30))).toBe(23);
  });
});

describe("диспетчер сповіщень", () => {
  it("надсилає прив'язаній людині: текст, кнопка на сайт, без звуку вдень", async () => {
    await link();
    expect(await notifyUser("u1", notice(), NOON)).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ chat_id: "1001", parse_mode: "HTML" });
    expect(String(calls[0].body.text)).toContain("Нова пропозиція");
    expect(JSON.stringify(calls[0].body.reply_markup)).toContain("https://site.test/?open=offers%3Ar1&utm_source=telegram&utm_medium=bot");
    expect(calls[0].body.disable_notification).toBeUndefined();
  });

  it("мовчить, коли бот вимкнений, прив'язки немає або вона неактивна", async () => {
    expect(await notifyUser("u1", notice(), NOON)).toBe("no_link");
    await link();
    await ctx.db.prepare("update telegram_links set active = 0").run();
    expect(await notifyUser("u1", notice(), NOON)).toBe("no_link");
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(await notifyUser("u1", notice(), NOON)).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("поважає налаштування: канал Telegram і вид сповіщення", async () => {
    await link();
    await savePrefs("u1", { kinds: { offers: false } });
    expect(await notifyUser("u1", notice(), NOON)).toBe("off");
    await savePrefs("u1", { kinds: { offers: true }, channels: { telegram: false } });
    expect(await notifyUser("u1", notice(), NOON)).toBe("off");
    expect(calls).toHaveLength(0);
  });

  it("пропозиції й повідомлення не шле, поки людина на сайті; угоди шле завжди", async () => {
    await link();
    await markPresence(ctx.db, "u1", true, NOON);
    expect(await notifyUser("u1", notice(), NOON)).toBe("online");
    expect(await notifyUser("u1", messageNotice({ conversationId: "c1", fromName: "Оля", text: "привіт", now: NOON }), NOON)).toBe("online");
    expect(await notifyUser("u1", dealNotice({ dealId: "d1", action: "accept" })!, NOON)).toBe("sent");
    // Пульс застарів: людина вже не на сайті.
    await markPresence(ctx.db, "u1", true, NOON - 10 * 60_000);
    expect(await notifyUser("u1", notice({ key: "offer:r2:x" }), NOON)).toBe("sent");
  });

  it("той самий ключ удруге не шле; інший ключ шле", async () => {
    await link();
    expect(await notifyUser("u1", notice(), NOON)).toBe("sent");
    expect(await notifyUser("u1", notice(), NOON)).toBe("duplicate");
    expect(await notifyUser("u1", notice({ key: "offer:r1:інше-вікно" }), NOON)).toBe("sent");
    expect(calls).toHaveLength(2);
  });

  it("вікно 10 хвилин: те саме повідомлення через вікно шлемо знову", () => {
    const a = offerNotice({ requestId: "r1", requestText: "x", price: null, days: 1, now: 0 });
    const b = offerNotice({ requestId: "r1", requestText: "x", price: null, days: 1, now: WINDOW_MS - 1 });
    const c = offerNotice({ requestId: "r1", requestText: "x", price: null, days: 1, now: WINDOW_MS });
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
    expect(bucket(WINDOW_MS)).toBe(1);
  });

  it("вночі, з тихими годинами, шле без звуку; без тихих годин зі звуком", async () => {
    await link();
    await notifyUser("u1", notice(), LATE);
    expect(calls[0].body.disable_notification).toBe(true);
    await savePrefs("u1", { quietHours: false });
    await notifyUser("u1", notice({ key: "offer:r1:інший" }), LATE);
    expect(calls[1].body.disable_notification).toBeUndefined();
  });

  it(`запити під теги: не більше ${MATCHING_DAILY_LIMIT} на людину за добу`, async () => {
    await link();
    const outcomes: string[] = [];
    for (let index = 0; index < MATCHING_DAILY_LIMIT + 2; index++) {
      outcomes.push(await notifyUser("u1", matchNotice({ requestId: `r${index}`, userId: "u1", text: "Потрібен сайт", place: "Київ" }), NOON));
    }
    expect(outcomes.filter((outcome) => outcome === "sent")).toHaveLength(MATCHING_DAILY_LIMIT);
    expect(outcomes.at(-1)).toBe("limit");
    // Наступної доби знову можна.
    expect(await notifyUser("u1", matchNotice({ requestId: "r-next", userId: "u1", text: "Потрібен сайт", place: "Київ" }), NOON + 25 * 3_600_000)).toBe("sent");
  });

  it("людина заблокувала бота (403): прив'язка гасне з відміткою, ключ звільнено", async () => {
    await link();
    respond = () => Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
    expect(await notifyUser("u1", notice(), NOON)).toBe("failed");
    expect(await getLink("u1")).toMatchObject({ active: false });
    expect((await getLink("u1"))?.blockedAt).not.toBeNull();
    expect(await getDb().select().from(notificationLog)).toHaveLength(0);
  });

  it("429 з короткою паузою: одна повторна спроба, далі успіх", async () => {
    await link();
    let attempts = 0;
    respond = () => (++attempts === 1 ? Response.json({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 0 } }) : Response.json({ ok: true, result: { message_id: 1 } }));
    expect(await notifyUser("u1", notice(), NOON)).toBe("sent");
    expect(attempts).toBe(2);
  });

  it("інша помилка Telegram: ключ звільняється, щоб наступна подія могла спробувати знову", async () => {
    await link();
    respond = () => Response.json({ ok: false, error_code: 500, description: "Internal" });
    expect(await notifyUser("u1", notice(), NOON)).toBe("failed");
    expect(await getDb().select().from(notificationLog)).toHaveLength(0);
    respond = () => Response.json({ ok: true, result: { message_id: 1 } });
    expect(await notifyUser("u1", notice(), NOON)).toBe("sent");
  });

  it("чужий чат не отримує: кожному його прив'язка", async () => {
    await link("u1");
    await link("u2");
    await notifyUser("u2", notice({ key: "offer:rx:1" }), NOON);
    expect(calls[0].body.chat_id).toBe("1002");
    expect((await getDb().select().from(telegramLinks)).length).toBe(2);
  });
});

describe("тексти сповіщень", () => {
  it("усе від людей екранується, контакти в запитах вирізаються", () => {
    const html = offerNotice({ requestId: "r", requestText: "Бот <b>для</b> мене, дзвоніть +380 99 111 22 33 або @nick_name", price: null, days: 3 }).html;
    expect(html).not.toContain("<b>для");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toMatch(/380|nick_name/);
    expect(html).toContain("ціну обговоримо");
    expect(messageNotice({ conversationId: "c", fromName: "<i>Хакер</i>", text: "a & b" }).html).toBe("<b>&lt;i&gt;Хакер&lt;/i&gt;</b>: a &amp; b");
  });

  it("stripContacts: телефони, пошта, @ніки, посилання", () => {
    expect(stripContacts("пишіть a@b.com, +38 (099) 111-22-33, @nick_name або https://t.me/x і www.site.ua")).not.toMatch(/a@b|099|nick_name|t\.me|site\.ua/);
    expect(stripContacts("Потрібен сайт для кав'ярні")).toBe("Потрібен сайт для кав'ярні");
  });

  it("угоди: текст за дією, невідомої дії немає; посилання з позначками", () => {
    for (const action of Object.keys(DEAL_TEXTS)) expect(dealNotice({ dealId: "d", action })?.key).toBe(`deal:d:${action}`);
    expect(dealNotice({ dealId: "d", action: "щось" })).toBeNull();
    expect(deepLink("chat:abc")).toBe("/?open=chat%3Aabc&utm_source=telegram&utm_medium=bot");
    expect(deepLink("request:r1", "channel")).toContain("utm_medium=channel");
  });
});

describe("кому слати «запит під теги»", () => {
  it("лише тим, кому підходить; автор виключений; найкращі першими; до ліміту", () => {
    const profiles = new Map<string, { tags: string[] }>([
      ["author", { tags: ["telegram-bot"] }],
      ["best", { tags: ["telegram-bot", "n8n"] }],
      ["parent", { tags: ["chat-bot"] }],
      ["other", { tags: ["figma"] }],
    ]);
    expect(pickMatching(["telegram-bot"], profiles, "author")).toEqual(["best", "parent"]);
    expect(pickMatching([], profiles, "author")).toEqual([]);

    const many = new Map<string, { tags: string[] }>(Array.from({ length: 50 }, (_, index) => [`p${String(index).padStart(2, "0")}`, { tags: ["telegram-bot"] }]));
    expect(pickMatching(["telegram-bot"], many, "nobody")).toHaveLength(MATCH_NOTIFY_MAX);
  });
});
