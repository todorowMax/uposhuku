import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendLoginCode: sent }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { POST as LOGOUT } from "@/app/api/auth/logout/route";
import { GET as ME } from "@/app/api/auth/me/route";
import { POST as START } from "@/app/api/auth/email/start/route";
import { POST as VERIFY } from "@/app/api/auth/email/verify/route";
import { sessions, users } from "@/db/schema";
import { getSessionUser, startEmailLogin, verifyEmailLogin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { codeSentTo, userIdOf } from "../helpers/auth-flow";
import { cookieJar } from "../helpers/cookie-jar";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
const ENV_KEYS = ["DEPLOY_ENV", "MAIL_MODE", "RESEND_API_KEY", "AUTH_SECRET", "DEV_LOGIN_CODE"];
const SECRET = "s".repeat(40);
const key = (text: string) => new TextEncoder().encode(text);

beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_SECRET = SECRET;
  sent.mockReset();
  cookieJar.clear();
});

const fresh = () => {
  counter++;
  return { email: `session-${counter}@example.com`, ip: `10.6.0.${counter}` };
};

const login = async () => {
  const { email, ip } = fresh();
  await startEmailLogin(email, ip);
  await verifyEmailLogin(email, codeSentTo(sent, email), ip);
  const token = cookieJar.get("vm_session")!.value;
  return { email, token, userId: await userIdOf(email) };
};

const sessionIdOf = async (userId: string) => (await getDb().select().from(sessions).where(eq(sessions.userId, userId)))[0].id;

/** Токен із чужим або тим самим ключем: підробки перевіряємо готовим JWT, а не логікою auth.ts. */
const tokenWith = async (claims: { sub: string; jti: string; exp?: number }, secret: string) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(claims.sub).setJti(claims.jti).setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 3600).sign(key(secret));

const asToken = (token: string) => {
  cookieJar.clear();
  cookieJar.set("vm_session", token);
};

const json = (body: unknown) => new Request("https://findlyfy.test/api", { method: "POST", body: JSON.stringify(body) });
/** Вхід із галочкою «Мені є 18 років і приймаю умови»: без неї новий акаунт відхиляється (tests/unit/legal-accept.test.ts). */
const verifyBody = (fields: Record<string, unknown>) => json({ ...fields, accepted: true });

describe("сесії", () => {
  it("справжній токен дає користувача, без токена гість", async () => {
    const { email } = await login();
    expect((await getSessionUser())?.email).toBe(email);
    cookieJar.clear();
    expect(await getSessionUser()).toBeNull();
  });

  it("підписаний чужим ключем токен відхиляється, навіть із живою сесією в базі", async () => {
    const { token, userId } = await login();
    const jti = await sessionIdOf(userId);
    asToken(await tokenWith({ sub: userId, jti }, "x".repeat(40)));
    expect(await getSessionUser()).toBeNull();
    // Контроль: той самий токен з правильним ключем проходить, отже відмова саме через підпис.
    asToken(await tokenWith({ sub: userId, jti }, SECRET));
    expect((await getSessionUser())?.id).toBe(userId);
    asToken(token);
    expect((await getSessionUser())?.id).toBe(userId);
  });

  it("змінений вміст токена, сміття й токен без підпису відхиляються", async () => {
    const { token, userId } = await login();
    const [head, body, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "someone-else" })).toString("base64url");
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${body}.`;
    for (const bad of [`${head}.${forgedBody}.${signature}`, unsigned, "not-a-token", `${head}.${body}`]) {
      asToken(bad);
      expect(await getSessionUser()).toBeNull();
    }
    asToken(token);
    expect((await getSessionUser())?.id).toBe(userId);
  });

  it("правильний підпис без рядка в sessions або з чужим sub не діє", async () => {
    const { userId } = await login();
    const other = await login();
    asToken(await tokenWith({ sub: userId, jti: "no-such-session" }, SECRET));
    expect(await getSessionUser()).toBeNull();
    asToken(await tokenWith({ sub: other.userId, jti: await sessionIdOf(userId) }, SECRET));
    expect(await getSessionUser()).toBeNull();
  });

  it("сплив JWT, сплив рядка сесії й 14 днів без активності закривають сесію", async () => {
    const { userId, token } = await login();
    const jti = await sessionIdOf(userId);
    asToken(await tokenWith({ sub: userId, jti, exp: Math.floor(Date.now() / 1000) - 10 }, SECRET));
    expect(await getSessionUser()).toBeNull();

    asToken(token);
    await getDb().update(sessions).set({ expiresAt: Date.now() - 1 }).where(eq(sessions.id, jti));
    expect(await getSessionUser()).toBeNull();

    await getDb().update(sessions).set({ expiresAt: Date.now() + 3600_000, lastSeenAt: Date.now() - 15 * 86_400_000 }).where(eq(sessions.id, jti));
    expect(await getSessionUser()).toBeNull();

    // Два дні тиші ще нічого: сесія жива, а мітка активності оновлюється.
    const before = Date.now() - 2 * 86_400_000;
    await getDb().update(sessions).set({ lastSeenAt: before }).where(eq(sessions.id, jti));
    expect((await getSessionUser())?.id).toBe(userId);
    const [row] = await getDb().select().from(sessions).where(eq(sessions.id, jti));
    expect(row.lastSeenAt).toBeGreaterThan(before);
  });

  it("вихід відкликає сесію: старий токен більше не працює", async () => {
    const { token, userId } = await login();
    const response = await LOGOUT();
    expect(response.status).toBe(204);
    expect(cookieJar.get("vm_session")).toBeUndefined();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    // Хтось зберіг токен до виходу й підставляє його знову.
    asToken(token);
    expect(await getSessionUser()).toBeNull();
    expect(await (await ME()).json()).toEqual({ user: null });
  });

  it("вихід закриває лише свою сесію, інші пристрої лишаються", async () => {
    const first = await login();
    const secondToken = await (async () => {
      const email = first.email;
      cookieJar.clear();
      await startEmailLogin(email, `10.6.9.${counter}`);
      await verifyEmailLogin(email, codeSentTo(sent, email), `10.6.9.${counter}`);
      return cookieJar.get("vm_session")!.value;
    })();
    asToken(first.token);
    await LOGOUT();
    asToken(secondToken);
    expect((await getSessionUser())?.id).toBe(first.userId);
  });

  it("вихід без сесії теж 204", async () => {
    expect((await LOGOUT()).status).toBe(204);
  });
});

describe("cookie сесії", () => {
  it("HttpOnly, SameSite=Lax, шлях /, на 30 днів; Secure поза продом не ставимо", async () => {
    await login();
    const stored = cookieJar.peek("vm_session")!;
    expect(stored.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400, secure: false });
  });

  it("на проді cookie Secure", async () => {
    process.env.DEPLOY_ENV = "production";
    await login();
    expect(cookieJar.peek("vm_session")!.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
  });

  it("на проді без AUTH_SECRET сесію не відкриваємо: 503 і жодної cookie", async () => {
    process.env.DEPLOY_ENV = "production";
    delete process.env.AUTH_SECRET;
    const { email, ip } = fresh();
    await startEmailLogin(email, ip);
    const response = await VERIFY(verifyBody({ email, code: codeSentTo(sent, email) }));
    expect(response.status).toBe(503);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });
});

describe("режими пошти", () => {
  it("на проді без RESEND_API_KEY вхід вимкнений: start і verify дають 503, лист не йде, користувача не створено", async () => {
    process.env.DEPLOY_ENV = "production";
    delete process.env.RESEND_API_KEY;
    const { email } = fresh();
    const started = await START(json({ email }));
    expect(started.status).toBe(503);
    expect(sent).not.toHaveBeenCalled();
    expect(await getDb().select().from(users).where(eq(users.email, email))).toHaveLength(0);
    const verified = await VERIFY(verifyBody({ email, code: "000000" }));
    expect(verified.status).toBe(503);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });

  it("на проді з ключем код 000000 і DEV_LOGIN_CODE не діють, підказка hint не повертається", async () => {
    process.env.DEPLOY_ENV = "production";
    process.env.MAIL_MODE = "dev";
    process.env.DEV_LOGIN_CODE = "424242";
    const { email } = fresh();
    const started = await START(json({ email }));
    expect(started.status).toBe(200);
    const body = (await started.json()) as Record<string, unknown>;
    expect(body).toEqual({ sent: true, mock: false, codeLength: 6 });
    expect("hint" in body).toBe(false);
    const real = codeSentTo(sent, email);
    for (const guess of ["000000", "424242"]) {
      // Випадковий справжній код збігся б із вгаданим раз на мільйон.
      if (guess === real) continue;
      const response = await VERIFY(verifyBody({ email, code: guess }));
      expect(response.status).toBe(400);
    }
    expect(cookieJar.get("vm_session")).toBeUndefined();
    expect((await VERIFY(verifyBody({ email, code: real }))).status).toBe(200);
  });

  it("поза продом у тестовому режимі код 000000 працює й підказка повертається (контроль для проду)", async () => {
    process.env.MAIL_MODE = "dev";
    delete process.env.RESEND_API_KEY;
    const { email } = fresh();
    const body = (await (await START(json({ email }))).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ sent: true, mock: true, codeLength: 6, hint: "000000" });
    expect((await VERIFY(verifyBody({ email, code: "000000" }))).status).toBe(200);
  });

  it("власний DEV_LOGIN_CODE: підказки немає, 000000 більше не діє", async () => {
    process.env.MAIL_MODE = "dev";
    process.env.DEV_LOGIN_CODE = "424242";
    const { email } = fresh();
    const body = (await (await START(json({ email }))).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ mock: true, codeLength: 6 });
    expect("hint" in body).toBe(false);
    expect((await VERIFY(verifyBody({ email, code: "000000" }))).status).toBe(400);
    expect((await VERIFY(verifyBody({ email, code: "424242" }))).status).toBe(200);
  });
});

describe("маршрути входу: тіло й відповіді", () => {
  it("400 на зламаний JSON, погану пошту й код неправильної форми", async () => {
    const broken = new Request("https://findlyfy.test/api", { method: "POST", body: "{not json" });
    expect((await START(broken)).status).toBe(400);
    expect((await START(json({ email: "no-at-sign" }))).status).toBe(400);
    expect((await START(json({ email: 42 }))).status).toBe(400);
    const { email } = fresh();
    expect((await VERIFY(json({ email: "bad", code: "123456" }))).status).toBe(400);
    for (const code of ["", "12", "abcdef", "123456789", 123456]) expect((await VERIFY(verifyBody({ email, code }))).status).toBe(400);
    expect(sent).not.toHaveBeenCalled();
  });

  it("429 від ліміту доходить до відповіді з типом rate-limited", async () => {
    const { email } = fresh();
    for (let index = 0; index < 8; index++) await START(new Request("https://findlyfy.test/api", { method: "POST", body: JSON.stringify({ email }), headers: { "cf-connecting-ip": `10.7.${counter}.${index}` } }));
    const limited = await START(new Request("https://findlyfy.test/api", { method: "POST", body: JSON.stringify({ email }), headers: { "cf-connecting-ip": "10.7.200.1" } }));
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { type: string }).type).toBe("/problems/rate-limited");
  });

  it("відповідь start однакова для нової й наявної пошти: пошту перебором не вгадати", async () => {
    const existing = await login();
    cookieJar.clear();
    const known = await START(json({ email: existing.email }));
    const unknown = await START(json({ email: `never-seen-${counter}@example.com` }));
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it("/api/auth/me віддає гостю null, а вхідному лише його власні дані", async () => {
    expect(await (await ME()).json()).toEqual({ user: null });
    const { email } = await login();
    const body = (await (await ME()).json()) as { user: { email: string; name: string | null } };
    expect(body.user.email).toBe(email);
    expect(body.user.name).toBeNull();
  });
});
