import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendLoginCode: sent }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { and, eq, like } from "drizzle-orm";
import { authAttempts, emailCodes, sessions } from "@/db/schema";
import { AuthError, startEmailLogin, verifyEmailLogin } from "@/lib/server/auth";
import { takeAttempt } from "@/lib/server/attempts";
import { getDb } from "@/lib/server/db";
import { ageCode, codeSentTo, userIdOf, wrongCodeFor } from "../helpers/auth-flow";
import { cookieJar } from "../helpers/cookie-jar";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
const ENV_KEYS = ["DEPLOY_ENV", "MAIL_MODE", "RESEND_API_KEY", "AUTH_SECRET", "DEV_LOGIN_CODE"];

beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  // Режим «resend»: код випадковий, лист підмінений шпигуном.
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_SECRET = "a".repeat(40);
  sent.mockReset();
  cookieJar.clear();
});

const fresh = () => {
  counter++;
  return { email: `login-${counter}@example.com`, ip: `10.1.0.${counter}` };
};

/** Просить код і повертає його з «листа». */
const requestCode = async (email: string, ip: string) => {
  await startEmailLogin(email, ip);
  return codeSentTo(sent, email);
};

const failure = async (run: Promise<unknown>) => {
  try {
    await run;
  } catch (error) {
    if (error instanceof AuthError) return error;
    throw error;
  }
  throw new Error("Очікували відмову входу");
};

const sessionCount = async (email: string) => (await getDb().select().from(sessions).where(eq(sessions.userId, await userIdOf(email)))).length;

describe("код входу", () => {
  it("вірний код входить і гаситься: вдруге той самий не працює", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    const user = await verifyEmailLogin(email, code, ip);
    expect(user.email).toBe(email);
    expect(await sessionCount(email)).toBe(1);
    expect(cookieJar.get("vm_session")).toBeDefined();

    cookieJar.clear();
    const again = await failure(verifyEmailLogin(email, code, ip));
    expect(again.status).toBe(400);
    expect(again.type).toBe("/problems/invalid-code");
    expect(await sessionCount(email)).toBe(1);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });

  it("невірний код відхиляється й сесії не відкриває, а вірний після однієї помилки ще працює", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    const error = await failure(verifyEmailLogin(email, wrongCodeFor(code), ip));
    expect(error.status).toBe(400);
    expect(await sessionCount(email)).toBe(0);
    expect(cookieJar.get("vm_session")).toBeUndefined();
    expect((await verifyEmailLogin(email, code, ip)).email).toBe(email);
  });

  it("прострочений код відхиляється", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    await getDb().update(emailCodes).set({ expiresAt: Date.now() - 1000 }).where(eq(emailCodes.userId, await userIdOf(email)));
    expect((await failure(verifyEmailLogin(email, code, ip))).status).toBe(400);
    expect(await sessionCount(email)).toBe(0);
  });

  it("5 невірних спроб гасять код, і вірний після них уже не входить", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    for (let index = 0; index < 5; index++) expect((await failure(verifyEmailLogin(email, wrongCodeFor(code), ip))).status).toBe(400);
    const afterwards = await failure(verifyEmailLogin(email, code, ip));
    expect(afterwards.status).toBe(400);
    expect(await sessionCount(email)).toBe(0);
  });

  it("новий запит коду замінює старий: старий більше не підходить", async () => {
    const { email, ip } = fresh();
    const first = await requestCode(email, ip);
    await ageCode(email);
    const second = await requestCode(email, ip);
    expect(sent).toHaveBeenCalledTimes(2);
    const rows = await getDb().select().from(emailCodes).where(eq(emailCodes.userId, await userIdOf(email)));
    expect(rows).toHaveLength(1);
    // Два випадкові 6-значні коди збігаються раз на мільйон; тоді перевіряти нічого.
    if (first !== second) expect((await failure(verifyEmailLogin(email, first, ip))).status).toBe(400);
    expect((await verifyEmailLogin(email, second, ip)).email).toBe(email);
  });

  it("повторний запит раніше ніж за 60 с нового листа не шле, старий код живий", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    await startEmailLogin(email, ip);
    expect(sent).toHaveBeenCalledTimes(1);
    expect((await verifyEmailLogin(email, code, ip)).email).toBe(email);
  });

  it("у базі лежить хеш, а не код", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    const [row] = await getDb().select().from(emailCodes).where(eq(emailCodes.userId, await userIdOf(email)));
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.codeHash).not.toBe(code);
    expect(Object.values(row)).not.toContain(code);
    expect(Object.values(row)).not.toContain(Number(code));
  });
});

describe("ліміти входу", () => {
  it("за поштою: 9-й запит коду відхиляється 429, хоч би й з іншого IP", async () => {
    const { email } = fresh();
    for (let index = 0; index < 8; index++) await startEmailLogin(email, `10.2.${counter}.${index}`);
    const error = await failure(startEmailLogin(email, `10.2.${counter}.99`));
    expect(error.status).toBe(429);
    expect(error.type).toBe("/problems/rate-limited");
  });

  it("за IP: зміна пошти ліміт не обходить", async () => {
    const { ip } = fresh();
    for (let index = 0; index < 8; index++) await startEmailLogin(`ip-start-${counter}-${index}@example.com`, ip);
    const error = await failure(startEmailLogin(`ip-start-${counter}-new@example.com`, ip));
    expect(error.status).toBe(429);
  });

  it("відмова за лімітом IP повертає вже взяту спробу пошти", async () => {
    const { ip } = fresh();
    for (let index = 0; index < 8; index++) await startEmailLogin(`release-${counter}-${index}@example.com`, ip);
    const victim = `release-${counter}-new@example.com`;
    expect((await failure(startEmailLogin(victim, ip))).status).toBe(429);
    const rows = await getDb().select().from(authAttempts).where(and(eq(authAttempts.key, `email:${victim}`), eq(authAttempts.kind, "email_start")));
    expect(rows).toHaveLength(0);
  });

  it("перевірка за поштою: 9 помилок підряд закривають вхід навіть із вірним кодом", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    for (let index = 0; index < 8; index++) expect(await takeAttempt(getDb(), { key: `email:${email}`, kind: "email_verify_fail", max: 8, windowMs: 900_000 })).not.toBeNull();
    const error = await failure(verifyEmailLogin(email, code, `10.4.${counter}.1`));
    expect(error.status).toBe(429);
    expect(await sessionCount(email)).toBe(0);
  });

  it("перевірка за IP: пошти змінювати марно, 9-та помилка з одного IP дає 429 навіть для чужого вірного коду", async () => {
    const { ip } = fresh();
    for (let index = 0; index < 8; index++) expect((await failure(verifyEmailLogin(`guess-${counter}-${index}@example.com`, "111111", ip))).status).toBe(400);
    expect((await failure(verifyEmailLogin(`guess-${counter}-next@example.com`, "111111", ip))).status).toBe(429);

    const victim = fresh();
    const code = await requestCode(victim.email, victim.ip);
    expect((await failure(verifyEmailLogin(victim.email, code, ip))).status).toBe(429);
    // З власного IP людина входить.
    expect((await verifyEmailLogin(victim.email, code, victim.ip)).email).toBe(victim.email);
  });

  it("успішний вхід не з'їдає ліміт помилок: лишаються лише справжні помилки", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    for (let index = 0; index < 3; index++) await failure(verifyEmailLogin(email, wrongCodeFor(code), ip));
    await verifyEmailLogin(email, code, ip);
    const count = async (key: string) => (await getDb().select().from(authAttempts).where(and(eq(authAttempts.key, key), eq(authAttempts.kind, "email_verify_fail")))).length;
    expect(await count(`email:${email}`)).toBe(3);
    expect(await count(`ip:${ip}`)).toBe(3);
  });

  it("ліміти різних людей незалежні", async () => {
    const one = fresh();
    const other = fresh();
    for (let index = 0; index < 8; index++) await startEmailLogin(one.email, `10.5.${counter}.${index}`);
    expect((await failure(startEmailLogin(one.email, one.ip))).status).toBe(429);
    await expect(startEmailLogin(other.email, other.ip)).resolves.toBeUndefined();
    const keys = await getDb().select().from(authAttempts).where(like(authAttempts.key, `email:${other.email}`));
    expect(keys).toHaveLength(1);
  });
});

describe("нова людина без імені", () => {
  it("вхід повертає name: null, а пошту використовує лише як логін", async () => {
    const { email, ip } = fresh();
    const code = await requestCode(email, ip);
    const user = await verifyEmailLogin(email, code, ip);
    expect(user.name).toBeNull();
    expect(user.via).toBe("email");
  });
});
