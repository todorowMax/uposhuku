// Вхід після видалення: «могила» не оживає, старий токен мертвий, та сама пошта дає новий порожній акаунт.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendLoginCode: sent }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { tombstoneEmail } from "@/lib/account/deletion";
import { deleteAccount } from "@/lib/server/account-delete";
import { AuthError, getSessionUser, startEmailLogin, verifyEmailLogin } from "@/lib/server/auth";
import { codeSentTo, userIdOf } from "../helpers/auth-flow";
import { cookieJar } from "../helpers/cookie-jar";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  for (const key of ["DEPLOY_ENV", "MAIL_MODE", "RESEND_API_KEY", "DEV_LOGIN_CODE"]) delete process.env[key];
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_SECRET = "a".repeat(40);
  sent.mockReset();
  cookieJar.clear();
});

const signIn = async (email: string, ip: string) => {
  await startEmailLogin(email, ip);
  return verifyEmailLogin(email, codeSentTo(sent, email), ip);
};

describe("після видалення акаунта", () => {
  it("сесія до видалення більше не діє, а в «могилу» не увійти навіть із кодом", async () => {
    const email = "gone-1@example.com";
    const user = await signIn(email, "10.9.0.1");
    expect((await getSessionUser())?.id).toBe(user.id);
    expect(await deleteAccount(user.id)).toEqual({ kind: "deleted" });
    expect(await getSessionUser()).toBeNull();

    // Навіть якщо хтось знає пошту «могили» й має код (тестовий вхід), акаунт не відкривається.
    const grave = tombstoneEmail(user.id);
    await startEmailLogin(grave, "10.9.0.2");
    expect(sent.mock.calls.some((call) => call[0] === grave)).toBe(false);
    await expect(verifyEmailLogin(grave, "000000", "10.9.0.2")).rejects.toBeInstanceOf(AuthError);
  });

  it("навіть живий рядок сесії «могили» не дає увійти", async () => {
    const user = await signIn("gone-3@example.com", "10.9.2.1");
    expect(await deleteAccount(user.id)).toEqual({ kind: "deleted" });
    const now = Date.now();
    await ctx.db.prepare("insert into sessions (id, user_id, via, created_at, expires_at, last_seen_at) values ('grave-jti', ?, 'email', ?, ?, ?)").bind(user.id, now, now + 1e9, now).run();
    // Токен із тим самим jti, що в рядку сесії: перевірка має відмовити саме через deleted_at.
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setJti("grave-jti").setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    cookieJar.set("vm_session", token);
    expect(await getSessionUser()).toBeNull();
  });

  it("та сама пошта дає новий акаунт без старих даних", async () => {
    const email = "gone-2@example.com";
    const first = await signIn(email, "10.9.1.1");
    await deleteAccount(first.id);
    cookieJar.clear();
    const second = await signIn(email, "10.9.1.2");
    expect(second.id).not.toBe(first.id);
    expect(await userIdOf(email)).toBe(second.id);
  });
});
