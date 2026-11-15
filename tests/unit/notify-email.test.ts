import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationLog } from "@/db/schema";
import { GET, POST } from "@/app/api/notifications/unsubscribe/route";
import { OPERATOR } from "@/lib/legal/config";
import { getDb } from "@/lib/server/db";
import { EMAIL_WINDOW_MS, notifyEmail } from "@/lib/server/notify-email";
import { getPrefs, savePrefs } from "@/lib/server/notification-prefs-repo";
import { markPresence } from "@/lib/server/presence-sql";
import { signUnsubscribeToken } from "@/lib/server/unsubscribe-token";
import { dealNotice, matchNotice, messageNotice, offerNotice } from "@/lib/telegram/notices";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let sent: { url: string; body: Record<string, unknown> }[] = [];
let resendStatus = 200;

const NOON = Date.UTC(2026, 9, 10, 10, 0);
const SECRET_TEXT = "секретна фраза для друга +380991112233 someone@mail.com";

beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "u1", { email: "u1@example.com" });
  await makeUser(ctx.db, "gone", { email: "gone@example.com" });
  await ctx.db.prepare("update users set deleted_at = 1 where id = 'gone'").run();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  sent = [];
  resendStatus = 200;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.SITE_URL = "https://site.test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(resendStatus === 200 ? "{}" : "boom", { status: resendStatus });
    })
  );
  for (const table of ["notification_log", "notification_preferences", "presence"]) await ctx.db.prepare(`delete from ${table}`).run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const name of ["RESEND_API_KEY", "SITE_URL", "MAIL_MODE"]) delete process.env[name];
});

const message = (text = SECRET_TEXT) => messageNotice({ conversationId: "c1", toUserId: "u1", fromName: "Оля", text, now: NOON });
const offer = () => offerNotice({ requestId: "r1", requestText: "Потрібен сайт для кав'ярні, дзвоніть +380 99 111 22 33", price: 1000, days: 3 });
const mailText = (index = 0) => JSON.stringify(sent[index].body);

describe("лист про подію: хто й коли його отримує", () => {
  it("офлайн людина отримує лист: тема, посилання, відписка, заголовки, підпис оператора", async () => {
    expect(await notifyEmail("u1", message(), NOON)).toBe("sent");
    expect(sent).toHaveLength(1);
    const body = sent[0].body as { to: string[]; subject: string; text: string; html: string; headers: Record<string, string> };
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    expect(body.to).toEqual(["u1@example.com"]);
    expect(body.subject).toBe("Нове повідомлення від Оля");
    expect(body.text).toContain("https://site.test/?open=chat%3Ac1");
    expect(body.text).not.toContain("utm_");
    expect(body.text).toContain(OPERATOR.entity);
    expect(body.text).toContain(OPERATOR.taxId);
    expect(body.html).toContain(OPERATOR.address);
    expect(body.html).not.toMatch(/<img|<script/);
    const unsubscribe = /https:\/\/site\.test\/api\/notifications\/unsubscribe\?token=[\w.-]+/.exec(body.text)?.[0];
    expect(unsubscribe).toBeTruthy();
    expect(body.headers["List-Unsubscribe"]).toBe(`<${unsubscribe}>`);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("людина на сайті листа не отримує", async () => {
    await markPresence(ctx.db, "u1", true, NOON);
    expect(await notifyEmail("u1", message(), NOON)).toBe("online");
    expect(await notifyEmail("u1", offer(), NOON)).toBe("online");
    expect(sent).toHaveLength(0);
    // Пульс застарів: людини вже немає.
    await markPresence(ctx.db, "u1", true, NOON - 10 * 60_000);
    expect(await notifyEmail("u1", message(), NOON)).toBe("sent");
  });

  it("поважає налаштування: канал пошти й вид сповіщення", async () => {
    await savePrefs("u1", { channels: { email: false } });
    expect(await notifyEmail("u1", message(), NOON)).toBe("off");
    await savePrefs("u1", { channels: { email: true }, kinds: { messages: false } });
    expect(await notifyEmail("u1", message(), NOON)).toBe("off");
    expect(sent).toHaveLength(0);
  });

  it("видалений акаунт і невідома людина без листа", async () => {
    expect(await notifyEmail("gone", message(), NOON)).toBe("no_address");
    expect(await notifyEmail("nobody", message(), NOON)).toBe("no_address");
    expect(sent).toHaveLength(0);
  });

  it("лист є лише для повідомлень, відгуків і вибраних подій угоди", async () => {
    expect(await notifyEmail("u1", matchNotice({ requestId: "r", userId: "u1", text: "x", place: "Київ" }), NOON)).toBe("no_email");
    expect(await notifyEmail("u1", dealNotice({ dealId: "d1", action: "fund" })!, NOON)).toBe("no_email");
    expect(await notifyEmail("u1", dealNotice({ dealId: "d1", action: "proposed" })!, NOON)).toBe("sent");
    expect(await notifyEmail("u1", offer(), NOON)).toBe("sent");
    expect(sent).toHaveLength(2);
  });

  it("повтор того самого випадку угоди листа не множить", async () => {
    expect(await notifyEmail("u1", dealNotice({ dealId: "d1", action: "accept" })!, NOON)).toBe("sent");
    expect(await notifyEmail("u1", dealNotice({ dealId: "d1", action: "accept" })!, NOON + 2 * EMAIL_WINDOW_MS)).toBe("duplicate");
    expect(sent).toHaveLength(1);
  });
});

describe("частота: не частіше разу на 30 хвилин на вид, далі «ще N нових»", () => {
  it("друге й третє повідомлення притримано, четверте через півгодини несе підсумок; інший вид не заблоковано", async () => {
    expect(await notifyEmail("u1", message(), NOON)).toBe("sent");
    expect(await notifyEmail("u1", message(), NOON + 60_000)).toBe("held");
    expect(await notifyEmail("u1", message(), NOON + 10 * 60_000)).toBe("held");
    expect(await notifyEmail("u1", offer(), NOON + 2 * 60_000)).toBe("sent");
    expect(sent).toHaveLength(2);
    expect(await notifyEmail("u1", message(), NOON + EMAIL_WINDOW_MS)).toBe("sent");
    const body = sent[2].body as { text: string };
    expect(body.text).toContain("ще 2 нових");
    // Лічильник почався заново: наступний лист без підсумку.
    expect(await notifyEmail("u1", message(), NOON + 2 * EMAIL_WINDOW_MS)).toBe("sent");
    expect((sent[3].body as { text: string }).text).not.toContain("нових");
  });

  it("скользяче вікно: через межу півгодинки, але за 10 хвилин після листа, лист притримано", async () => {
    const start = NOON + 25 * 60_000;
    expect(await notifyEmail("u1", message(), start)).toBe("sent");
    expect(await notifyEmail("u1", message(), start + 10 * 60_000)).toBe("held");
    expect(sent).toHaveLength(1);
  });

  it("усе пишеться в notification_log: надіслані й притримані окремими видами", async () => {
    await notifyEmail("u1", message(), NOON);
    await notifyEmail("u1", message(), NOON + 1000);
    const kinds = (await getDb().select().from(notificationLog)).map((row) => row.kind).sort();
    expect(kinds).toEqual(["email:message", "email_held:message"]);
  });

  it("збій Resend звільняє ключ: наступна подія пробує знову", async () => {
    resendStatus = 500;
    expect(await notifyEmail("u1", message(), NOON)).toBe("failed");
    expect(await getDb().select().from(notificationLog)).toHaveLength(0);
    resendStatus = 200;
    expect(await notifyEmail("u1", message(), NOON + 1000)).toBe("sent");
  });
});

describe("що не потрапляє в лист", () => {
  it("тексту повідомлення, телефону, пошти співрозмовника й адреси одержувача в тілі немає", async () => {
    await notifyEmail("u1", message(), NOON);
    const all = mailText();
    for (const secret of ["секретна фраза", "380991112233", "someone@mail.com"]) expect(all).not.toContain(secret);
    expect((sent[0].body as { text: string }).text).not.toContain("u1@example.com");
  });

  it("у листі про відгук лише назва запиту до 60 знаків, без контактів", async () => {
    const long = offerNotice({ requestId: "r2", requestText: `${"Дуже довга назва запиту ".repeat(6)} +380 99 111 22 33`, price: null, days: 1 });
    await notifyEmail("u1", long, NOON);
    const { subject } = sent[0].body as { subject: string };
    expect(subject.startsWith("Новий відгук на ваш запит «")).toBe(true);
    expect(subject.length).toBeLessThanOrEqual("Новий відгук на ваш запит «»".length + 61);
    expect(mailText()).not.toContain("380");
  });

  it("ім'я з HTML екранується, переносів у темі немає", async () => {
    await notifyEmail("u1", messageNotice({ conversationId: "c9", toUserId: "u1", fromName: "<b>Хакер</b>\nBcc: x@y.z", text: "т", now: NOON }), NOON);
    const body = sent[0].body as { subject: string; html: string };
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.html).not.toContain("<b>Хакер");
  });
});

describe("dev-режим: лист у журнал, не назовні", () => {
  it("MAIL_MODE=dev не звертається до Resend, а пише в консоль", async () => {
    process.env.MAIL_MODE = "dev";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await notifyEmail("u1", message(), NOON)).toBe("sent");
    expect(sent).toHaveLength(0);
    expect(log.mock.calls.flat().join("\n")).toContain("Нове повідомлення від Оля");
  });
});

describe("відписка одним кліком", () => {
  const url = (token: string | null) => `https://site.test/api/notifications/unsubscribe${token === null ? "" : `?token=${token}`}`;

  it("підписане посилання вимикає пошту, інше не чіпає; після цього листів немає", async () => {
    await savePrefs("u1", { channels: { telegram: false } });
    const token = (await signUnsubscribeToken("u1"))!;
    const response = await GET(new Request(url(token)));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Ви відписалися");
    expect(await getPrefs("u1")).toMatchObject({ channels: { email: false, telegram: false, push: false } });
    expect(await notifyEmail("u1", message(), NOON)).toBe("off");
    expect(sent).toHaveLength(0);
  });

  it("POST (List-Unsubscribe-Post) теж відписує", async () => {
    const token = (await signUnsubscribeToken("u1"))!;
    expect((await POST(new Request(url(token), { method: "POST", body: "List-Unsubscribe=One-Click" }))).status).toBe(200);
    expect((await getPrefs("u1")).channels.email).toBe(false);
  });

  it("підроблений, обрізаний, порожній і сесійний токен дають 400 і нічого не змінюють", async () => {
    const good = (await signUnsubscribeToken("u1"))!;
    const forged = `${good.slice(0, -4)}AAAA`;
    const otherKey = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u1").setAudience("email-unsubscribe").sign(new TextEncoder().encode("зовсім-інший-ключ-зовсім-інший-ключ-1234"));
    const session = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("u1").setJti("x").sign(new TextEncoder().encode("dev-only-secret-dev-only-secret-dev-only"));
    for (const token of [forged, otherKey, session, "дичина", good.split(".")[0], null]) {
      expect((await GET(new Request(url(token)))).status).toBe(400);
      expect((await POST(new Request(url(token), { method: "POST" }))).status).toBe(400);
    }
    expect((await getPrefs("u1")).channels.email).toBe(true);
  });

  it("видалений акаунт не отримує рядка налаштувань", async () => {
    const token = (await signUnsubscribeToken("gone"))!;
    expect((await GET(new Request(url(token)))).status).toBe(200);
    const rows = await ctx.db.prepare("select count(*) as n from notification_preferences where user_id = 'gone'").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
