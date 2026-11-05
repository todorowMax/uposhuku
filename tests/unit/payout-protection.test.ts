import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeBase32, totpCode, verifyTotp } from "@/lib/admin/totp";
import { newAccountLimit, NEW_ACCOUNT_MAX_STAGE, releaseNeedsCode, RELEASE_CODE_FROM } from "@/lib/deals/limits";
import { isValidTaxId, maskTaxId, validatePayoutApplication } from "@/lib/deals/payout";
import { contentSecurityPolicy, MAP_ORIGINS, securityHeaders } from "@/lib/security-headers";

/** ІПН із вірною контрольною цифрою за алгоритмом: перші 9 цифр, остання обчислена. */
const withCheckDigit = (nine: string): string => {
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(nine[index]), 0);
  return nine + String((sum % 11) % 10);
};

describe("ІПН і заявка на виплати", () => {
  it("контрольна цифра: вірний проходить, зіпсований і нецифровий ні", () => {
    const good = withCheckDigit("301234567");
    expect(isValidTaxId(good)).toBe(true);
    const wrong = good.slice(0, 9) + String((Number(good[9]) + 1) % 10);
    expect(isValidTaxId(wrong)).toBe(false);
    expect(isValidTaxId("12345")).toBe(false);
    expect(isValidTaxId(`${good.slice(0, 9)}a`)).toBe(false);
    expect(maskTaxId(good)).toBe(`${good.slice(0, 2)}******${good.slice(-2)}`);
  });

  it("заявка потребує назви ФОП, вірного ІПН, підтвердження рахунку в mono й згоди", () => {
    const base = { fopName: "  ФОП  Іваненко  ", taxId: withCheckDigit("301234567"), accountConfirmed: true, consent: true };
    expect(validatePayoutApplication(base)).toEqual({ ok: true, value: { fopName: "ФОП Іваненко", taxId: base.taxId } });
    expect(validatePayoutApplication({ ...base, fopName: "" })).toMatchObject({ ok: false });
    expect(validatePayoutApplication({ ...base, taxId: "1234567890" })).toMatchObject({ ok: false });
    expect(validatePayoutApplication({ ...base, accountConfirmed: false })).toMatchObject({ ok: false, error: expect.stringMatching(/monobank/) });
    expect(validatePayoutApplication({ ...base, consent: false })).toMatchObject({ ok: false, error: expect.stringMatching(/оферт/) });
    expect(validatePayoutApplication(null)).toMatchObject({ ok: false });
  });
});

describe("TOTP (RFC 6238)", () => {
  // Секрет з додатка B RFC 6238 ("12345678901234567890") у base32.
  const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("збігається з еталонним вектором RFC: T=59 → ...287082", async () => {
    expect(await totpCode(decodeBase32(SECRET)!, Math.floor(59 / 30))).toBe("287082");
  });

  it("приймає поточний і сусідні кроки, відкидає далекі, сміття й невірний секрет", async () => {
    const now = 1_700_000_000_000;
    const counter = Math.floor(now / 1000 / 30);
    const key = decodeBase32(SECRET)!;
    expect(await verifyTotp({ secret: SECRET, code: await totpCode(key, counter), now })).toBe(true);
    expect(await verifyTotp({ secret: SECRET, code: await totpCode(key, counter - 1), now })).toBe(true);
    expect(await verifyTotp({ secret: SECRET, code: await totpCode(key, counter + 5), now })).toBe(false);
    expect(await verifyTotp({ secret: SECRET, code: "abc", now })).toBe(false);
    expect(await verifyTotp({ secret: SECRET, code: undefined, now })).toBe(false);
    expect(await verifyTotp({ secret: "!!!", code: "123456", now })).toBe(false);
  });
});

describe("ліміти безпечної угоди", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-11-05T12:00:00Z");

  it("акаунт молодший за 7 днів: етап лише до 5 000 ₴; старший без обмеження", () => {
    expect(newAccountLimit({ createdAt: now - 2 * DAY, amount: NEW_ACCOUNT_MAX_STAGE, now })).toBeNull();
    expect(newAccountLimit({ createdAt: now - 2 * DAY, amount: NEW_ACCOUNT_MAX_STAGE + 1, now })).toMatch(/5\s?000/);
    expect(newAccountLimit({ createdAt: now - 7 * DAY, amount: 30_000, now })).toBeNull();
  });

  it("код приймання від 10 000 ₴ включно", () => {
    expect(releaseNeedsCode(RELEASE_CODE_FROM - 1)).toBe(false);
    expect(releaseNeedsCode(RELEASE_CODE_FROM)).toBe(true);
  });
});

describe("захисні заголовки", () => {
  it("CSP лише Report-Only, а три прості заголовки діють одразу", () => {
    const headers = securityHeaders();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(headers).not.toHaveProperty("Content-Security-Policy");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBeTruthy();
    expect(headers).not.toHaveProperty("Strict-Transport-Security");
  });

  it("політика пускає всі зовнішні адреси карти з коду стилю, воркер MapLibre і blob:", () => {
    const style = readFileSync("lib/maplibre/style.ts", "utf8");
    const origins = [...new Set([...style.matchAll(/https:\/\/[a-z0-9.-]+/gi)].map((match) => match[0]))];
    expect(origins.length).toBeGreaterThan(0);
    const csp = contentSecurityPolicy();
    for (const origin of origins) expect(csp).toContain(origin);
    expect([...MAP_ORIGINS].sort()).toEqual(origins.sort());
    expect(csp).toMatch(/worker-src[^;]*'self'[^;]*blob:/);
    expect(csp).toMatch(/img-src[^;]*data:[^;]*blob:/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });
});
