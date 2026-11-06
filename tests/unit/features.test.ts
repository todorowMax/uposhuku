import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: null as { id: string; email: string } | null, user: null as { id: string; email: string } | null }));
const mail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/lib/server/admin", () => ({ getAdmin: async () => state.admin }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendAdminNotice: mail }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { authAttempts, featureFlags } from "@/db/schema";
import { GET as ADMIN_GET, PUT as ADMIN_PUT } from "@/app/api/admin/features/route";
import { GET as OWN } from "@/app/api/features/route";
import { decodeBase32, totpCode } from "@/lib/admin/totp";
import { featureAllowed, FEATURES, isMoneyFeature, parseFeatureMode, parseFeatureUsers, resolveFeature } from "@/lib/features/flags";
import { getDb } from "@/lib/server/db";
import { featureEnabledFor, featureMode, featuresFor } from "@/lib/server/features";
import { makeUser, useTestD1 } from "../helpers/d1";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "ft-adm");
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(authAttempts);
  await getDb().delete(featureFlags);
  mail.mockReset();
  state.admin = { id: "ft-adm", email: "boss@example.com" };
  state.user = { id: "u1", email: "max@example.com" };
  process.env.ADMIN_EMAILS = "boss@example.com";
});
afterEach(() => {
  for (const key of ["ADMIN_EMAILS", "ADMIN_TOTP_SECRET", "DEPLOY_ENV", "CRYPTO_PROOF_MODE", "CRYPTO_PROOF_USERS", "SAFE_DEAL_MODE", "SAFE_DEAL_USERS"]) delete process.env[key];
});

const put = (body: Record<string, unknown>) => ADMIN_PUT(new Request("https://findlyfy.test/x", { method: "PUT", body: JSON.stringify(body) }));
// Коди одноразові: цей файл бере один код наступного кроку (вікно приймає ±1).
const code = async () => totpCode(decodeBase32(SECRET)!, Math.floor(Date.now() / 1000 / 30) + 1);

describe("чисті функції прапорців", () => {
  it("сміття це off, пошти нормалізуються, режим on пускає всіх, база важливіша за змінні", () => {
    expect(parseFeatureMode("ON?")).toBe("off");
    expect(parseFeatureUsers("A@x.com\n b@x.com;a@x.com,")).toEqual(["a@x.com", "b@x.com"]);
    expect(featureAllowed({ mode: "allowlist", users: ["a@x.com"] }, "A@X.com")).toBe(true);
    expect(featureAllowed({ mode: "allowlist", users: ["a@x.com"] }, null)).toBe(false);
    expect(resolveFeature({ mode: "off", users: "" }, { mode: "on" })).toEqual({ mode: "off", users: [] });
    expect(resolveFeature(null, { mode: "on" })).toEqual({ mode: "on", users: [] });
    expect(resolveFeature(null, {})).toEqual({ mode: "off", users: [] });
    expect(FEATURES.filter(isMoneyFeature)).toEqual(["safe_deal", "crypto_proof", "crypto_wallet", "crypto_escrow", "foreign_links"]);
  });
});

describe("значення на сервері", () => {
  it("база > змінні > off; SAFE_DEAL_MODE працює як раніше", async () => {
    expect(await featureMode("crypto_proof")).toBe("off");
    process.env.CRYPTO_PROOF_MODE = "on";
    expect(await featureEnabledFor("crypto_proof", "any@x.com")).toBe(true);
    await getDb().insert(featureFlags).values({ feature: "crypto_proof", mode: "allowlist", users: "max@example.com", updatedBy: "t", updatedAt: 1 });
    expect(await featureEnabledFor("crypto_proof", "any@x.com")).toBe(false);
    expect(await featureEnabledFor("crypto_proof", "MAX@example.com")).toBe(true);
    process.env.SAFE_DEAL_MODE = "allowlist";
    process.env.SAFE_DEAL_USERS = "max@example.com";
    expect(await featureEnabledFor("safe_deal", "max@example.com")).toBe(true);
    expect(await featureEnabledFor("safe_deal", "other@x.com")).toBe(false);
  });

  it("клієнт бачить лише свої булеві дозволи, без режимів і списків", async () => {
    await getDb().insert(featureFlags).values({ feature: "nbu_qr", mode: "allowlist", users: "max@example.com,secret@x.com", updatedBy: "t", updatedAt: 1 });
    const response = await OWN();
    const text = JSON.stringify(await response.json());
    expect(JSON.parse(text)).toEqual({ features: { safe_deal: false, crypto_proof: false, crypto_wallet: false, crypto_escrow: false, nbu_qr: true, foreign_links: false } });
    expect(text).not.toContain("secret@x.com");
    expect((await featuresFor("other@x.com")).nbu_qr).toBe(false);
    state.user = null;
    expect((await OWN()).status).toBe(401);
  });
});

describe("/api/admin/features", () => {
  it("не адміну 404", async () => {
    state.admin = null;
    expect((await ADMIN_GET(new Request("https://findlyfy.test/x"))).status).toBe(404);
    expect((await put({ feature: "nbu_qr", mode: "on" })).status).toBe(404);
  });

  it("nbu_qr змінюється без коду й без листа; невідома функція чи порожній список 400", async () => {
    expect((await put({ feature: "nbu_qr", mode: "on" })).status).toBe(200);
    expect(await featureMode("nbu_qr")).toBe("on");
    expect(mail).not.toHaveBeenCalled();
    expect((await put({ feature: "nope", mode: "on" })).status).toBe(400);
    expect((await put({ feature: "nbu_qr", mode: "allowlist", users: " " })).status).toBe(400);
  });

  it("грошовий прапорець: на проді без секрету 403; із секретом без коду й із чужим 403; з вірним зберігається, лист власнику без пошт", async () => {
    process.env.DEPLOY_ENV = "production";
    expect((await put({ feature: "crypto_proof", mode: "on" })).status).toBe(403);
    process.env.ADMIN_TOTP_SECRET = SECRET;
    expect((await put({ feature: "crypto_proof", mode: "on" })).status).toBe(403);
    expect((await put({ feature: "crypto_proof", mode: "on", totp: "000000" })).status).toBe(403);
    expect(await featureMode("crypto_proof")).toBe("off");
    expect(mail).not.toHaveBeenCalled();

    const ok = await put({ feature: "crypto_proof", mode: "allowlist", users: "Max@Example.com", totp: await code() });
    expect(ok.status).toBe(200);
    expect(await featureEnabledFor("crypto_proof", "max@example.com")).toBe(true);
    expect(await featureEnabledFor("crypto_proof", "x@example.com")).toBe(false);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0]).toEqual(["boss@example.com"]);
    expect(JSON.stringify(mail.mock.calls)).not.toContain("max@example.com");
    const listed = (await (await ADMIN_GET(new Request("https://findlyfy.test/x"))).json()) as { features: { name: string; source: string }[] };
    expect(listed.features.find((item) => item.name === "crypto_proof")?.source).toBe("db");
  });
});
