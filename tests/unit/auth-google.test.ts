import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendLoginCode: sent }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET as GOOGLE_START } from "@/app/api/auth/google/route";
import { GET as GOOGLE_CALLBACK } from "@/app/api/auth/google/callback/route";
import { sessions, users } from "@/db/schema";
import { loginWithGoogle, startEmailLogin, verifyEmailLogin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { codeSentTo, userIdOf } from "../helpers/auth-flow";
import { cookieJar } from "../helpers/cookie-jar";
import { useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
const ENV_KEYS = ["DEPLOY_ENV", "MAIL_MODE", "RESEND_API_KEY", "AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const ORIGIN = "https://findlyfy.test";
const STUB_EMAIL = "google.test@example.com";

beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_SECRET = "g".repeat(40);
  sent.mockReset();
  cookieJar.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const configure = () => {
  process.env.GOOGLE_CLIENT_ID = "123.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
};

const fresh = () => {
  counter++;
  return { email: `google-${counter}@example.com`, googleId: `gid-${counter}` };
};

/** Підміна Google: токен-ендпоінт і userinfo. Мережу не чіпаємо. */
const fakeGoogle = (profile: Record<string, unknown> | null, token: { ok: boolean } = { ok: true }) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com/token")) return token.ok ? Response.json({ access_token: "at" }) : new Response("no", { status: 400 });
    if (url.includes("openidconnect.googleapis.com")) return profile ? Response.json(profile) : Response.json({ error: "invalid_token" }, { status: 401 });
    throw new Error(`Несподіваний запит назовні: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const callback = (options: { state?: string; saved?: { state: string; next?: string; accepted?: boolean } | null; code?: string | null } = {}) => {
  const { state = "good-state", saved = { state: "good-state", next: "/", accepted: true }, code = "auth-code" } = options;
  const url = new URL(`${ORIGIN}/api/auth/google/callback`);
  if (code) url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  const headers: Record<string, string> = saved ? { cookie: `vm_google_state=${encodeURIComponent(JSON.stringify(saved))}` } : {};
  return GOOGLE_CALLBACK(new Request(url, { headers }));
};

const usersWith = async (email: string) => getDb().select().from(users).where(eq(users.email, email));

describe("вхід через Google: початок", () => {
  it("на проді без налаштувань дає 503 і не створює тестовий акаунт та сесію", async () => {
    process.env.DEPLOY_ENV = "production";
    const response = await GOOGLE_START(new Request(`${ORIGIN}/api/auth/google?next=/cabinet`));
    expect(response.status).toBe(503);
    expect(await usersWith(STUB_EMAIL)).toHaveLength(0);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });

  it("на проді callback без налаштувань теж 503", async () => {
    process.env.DEPLOY_ENV = "production";
    const fetchMock = fakeGoogle({ sub: "x", email: "a@example.com", email_verified: true });
    expect((await callback()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("з налаштуваннями веде на Google зі state і кладе його в HttpOnly-cookie з наступним шляхом", async () => {
    configure();
    const response = await GOOGLE_START(new Request(`${ORIGIN}/api/auth/google?next=/cabinet`));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.host).toBe("accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    const state = target.searchParams.get("state")!;
    expect(state.length).toBeGreaterThan(20);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("vm_google_state=");
    expect(decodeURIComponent(cookie)).toContain(state);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(decodeURIComponent(cookie)).toContain("/cabinet");
    // Кожен вхід має свій state.
    const second = new URL((await GOOGLE_START(new Request(`${ORIGIN}/api/auth/google`))).headers.get("location")!);
    expect(second.searchParams.get("state")).not.toBe(state);
  });
});

describe("вхід через Google: повернення", () => {
  it("без cookie зі state, з чужим state або без code відхиляється 400 і не доходить до Google", async () => {
    configure();
    const fetchMock = fakeGoogle({ sub: "x", email: "forged@example.com", email_verified: true });
    expect((await callback({ saved: null })).status).toBe(400);
    expect((await callback({ state: "attacker-state" })).status).toBe(400);
    expect((await callback({ code: null })).status).toBe(400);
    expect((await callback({ saved: { state: "" }, state: "" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await usersWith("forged@example.com")).toHaveLength(0);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });

  it("зламана cookie зі state не пускає й не ламає сервер", async () => {
    configure();
    fakeGoogle({ sub: "x", email: "broken@example.com", email_verified: true });
    const url = new URL(`${ORIGIN}/api/auth/google/callback?code=c&state=s`);
    const response = await GOOGLE_CALLBACK(new Request(url, { headers: { cookie: "vm_google_state=%7Bbroken" } }));
    expect(response.status).toBe(400);
  });

  it("вдалий вхід: новий акаунт із підтвердженою поштою, сесія, редірект на свій шлях, cookie state прибрана", async () => {
    configure();
    const { email, googleId } = fresh();
    fakeGoogle({ sub: googleId, email, email_verified: true, name: "Олена Коваль", picture: null });
    const response = await callback({ saved: { state: "good-state", accepted: true, next: "/cabinet?tab=requests" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/cabinet?tab=requests`);
    expect(response.headers.get("set-cookie")).toContain("vm_google_state=;");
    const [row] = await usersWith(email);
    expect(row.googleId).toBe(googleId);
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(cookieJar.get("vm_session")).toBeDefined();
    expect(await getDb().select().from(sessions).where(eq(sessions.userId, row.id))).toHaveLength(1);
  });

  it("пошта, яку Google не підтвердив, або збій обміну коду не відкривають сесію", async () => {
    configure();
    const { email, googleId } = fresh();
    fakeGoogle({ sub: googleId, email, email_verified: false });
    expect((await callback()).status).toBe(400);
    fakeGoogle({ sub: googleId, email, email_verified: true }, { ok: false });
    expect((await callback()).status).toBe(400);
    fakeGoogle(null);
    expect((await callback()).status).toBe(400);
    expect(await usersWith(email)).toHaveLength(0);
    expect(cookieJar.get("vm_session")).toBeUndefined();
  });

  it("next на чужий сайт (//, https://, без /, зворотна скісна, табуляція) веде на головну, а не назовні", async () => {
    configure();
    for (const next of ["//evil.example/x", "https://evil.example/x", "evil.example", "javascript:alert(1)", "/\\evil.example", "/\t/evil.example"]) {
      const { email, googleId } = fresh();
      fakeGoogle({ sub: googleId, email, email_verified: true });
      const response = await callback({ saved: { state: "good-state", accepted: true, next } });
      expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
    }
  });

  it("і при старті next на чужий сайт у cookie не потрапляє", async () => {
    configure();
    const response = await GOOGLE_START(new Request(`${ORIGIN}/api/auth/google?next=${encodeURIComponent("//evil.example/x")}`));
    expect(decodeURIComponent(response.headers.get("set-cookie")!)).not.toContain("evil.example");
  });
});

describe("прив'язка Google до наявного акаунта", () => {
  it("пошта з коду входу й та сама пошта в Google (інший регістр) дають один акаунт", async () => {
    const { email, googleId } = fresh();
    await startEmailLogin(email, `10.8.0.${counter}`);
    const viaEmail = await verifyEmailLogin(email, codeSentTo(sent, email), `10.8.0.${counter}`);
    cookieJar.clear();
    const viaGoogle = await loginWithGoogle({ googleId, email: email.toUpperCase(), name: "Іван Петренко", picture: null });
    expect(viaGoogle.id).toBe(viaEmail.id);
    expect(viaGoogle.via).toBe("google");
    expect(await usersWith(email)).toHaveLength(1);
    const [row] = await usersWith(email);
    expect(row.googleId).toBe(googleId);
    expect(row.displayName).toBe("Іван Петренко");

    // Наступні входи за тим самим Google ID теж у цей акаунт.
    cookieJar.clear();
    const again = await loginWithGoogle({ googleId, email, name: "Інше Ім'я", picture: null });
    expect(again.id).toBe(viaEmail.id);
    expect((await usersWith(email))[0].displayName).toBe("Іван Петренко");
    expect(await userIdOf(email)).toBe(viaEmail.id);
  });
});

describe("тестовий акаунт Google", () => {
  it("поза продом без налаштувань вхід відкриває тестовий акаунт (контроль для проду)", async () => {
    const response = await GOOGLE_START(new Request(`${ORIGIN}/api/auth/google?next=/cabinet&accepted=1`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/cabinet`);
    expect(await usersWith(STUB_EMAIL)).toHaveLength(1);
    expect(cookieJar.get("vm_session")).toBeDefined();
  });
});
