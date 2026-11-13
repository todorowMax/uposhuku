import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const started = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), startEmailLogin: started }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), mailMode: () => "dev" }));
const logged = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry/log", () => ({ logServer: logged, logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET as siteKeyRoute } from "@/app/api/auth/turnstile/route";
import { POST as start } from "@/app/api/auth/email/start/route";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "@/lib/server/turnstile";

// Тестові ключі Cloudflare: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const SITE_KEY = "1x00000000000000000000AA";
const SECRET = "1x0000000000000000000000000000000AA";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

let siteverify: ReturnType<typeof vi.fn>;
const post = (body: Record<string, unknown>) => start(new Request("https://findlyfy.test/api/auth/email/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.9.0.1" }, body: JSON.stringify(body) }));

beforeEach(() => {
  started.mockClear();
  logged.mockClear();
  process.env.TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET = SECRET;
  // Як у Cloudflare: тестовий секрет приймає лише тестовий токен.
  siteverify = vi.fn(async (_url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    return Response.json(form.get("secret") === SECRET && form.get("response") === DUMMY_TOKEN ? { success: true, hostname: "example.com", "error-codes": [] } : { success: false, "error-codes": ["invalid-input-response"] });
  });
  vi.stubGlobal("fetch", siteverify);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET", "DEPLOY_ENV"]) delete process.env[name];
});

describe("перевірка Turnstile на вході", () => {
  it("поганий токен: 400, лист не йде, запит до siteverify форм-кодований із секретом і IP", async () => {
    const response = await post({ email: "a@example.com", turnstileToken: "поганий" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { type: string }).type).toBe("/problems/turnstile");
    expect(started).not.toHaveBeenCalled();
    const [url, init] = siteverify.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ secret: SECRET, response: "поганий", remoteip: "10.9.0.1" });
  });

  it("без токена й задовгий токен: 400 без звернення до Cloudflare", async () => {
    expect((await post({ email: "a@example.com" })).status).toBe(400);
    expect((await post({ email: "a@example.com", turnstileToken: "x".repeat(2049) })).status).toBe(400);
    expect(siteverify).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
  });

  it("добрий токен пускає до відправки коду", async () => {
    const response = await post({ email: "a@example.com", turnstileToken: DUMMY_TOKEN });
    expect(response.status).toBe(200);
    expect(started).toHaveBeenCalledWith("a@example.com", "10.9.0.1");
  });

  it("токен для іншої дії відхиляється, а відповідь без `action` (тестові ключі) проходить", async () => {
    siteverify.mockResolvedValueOnce(Response.json({ success: true, action: "contact" }));
    expect(await verifyTurnstile("token", "1.1.1.1")).toEqual({ ok: false, reason: "invalid" });
    siteverify.mockResolvedValueOnce(Response.json({ success: true, action: "login" }));
    expect(await verifyTurnstile("token", "1.1.1.1")).toEqual({ ok: true, skipped: false });
  });

  it("Cloudflare не відповів: 503, а не пропуск", async () => {
    siteverify.mockRejectedValueOnce(new Error("мережа"));
    expect((await post({ email: "a@example.com", turnstileToken: DUMMY_TOKEN })).status).toBe(503);
    siteverify.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    expect((await post({ email: "a@example.com", turnstileToken: DUMMY_TOKEN })).status).toBe(503);
    expect(started).not.toHaveBeenCalled();
  });

  it("без ключів перевірка пропускається і Cloudflare не викликається; ключ для клієнта null", async () => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET;
    expect((await post({ email: "a@example.com" })).status).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
    expect(await (await siteKeyRoute()).json()).toEqual({ siteKey: null });
  });

  it("з одним лише секретом перевірки теж немає: без публічного ключа віджета не з'явиться", async () => {
    delete process.env.TURNSTILE_SITE_KEY;
    expect(await verifyTurnstile(undefined, "1.1.1.1")).toEqual({ ok: true, skipped: true });
  });

  it("публічний ключ віддається клієнтові, секрет ніколи", async () => {
    const text = await (await siteKeyRoute()).text();
    expect(JSON.parse(text)).toEqual({ siteKey: SITE_KEY });
    expect(text).not.toContain(SECRET);
  });

  it("на проді без ключів один раз пишемо попередження, вхід не ламаємо", async () => {
    process.env.DEPLOY_ENV = "production";
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET;
    vi.resetModules();
    const fresh = await import("@/lib/server/turnstile");
    expect(await fresh.verifyTurnstile(undefined, "1.1.1.1")).toEqual({ ok: true, skipped: true });
    await fresh.verifyTurnstile(undefined, "1.1.1.1");
    const warnings = logged.mock.calls.filter(([entry]) => entry.event === "turnstile_not_configured");
    expect(warnings).toHaveLength(1);
  });
});
