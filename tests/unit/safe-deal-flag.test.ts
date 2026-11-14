import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { featureAllowed, parseFeatureMode, parseFeatureUsers } from "@/lib/features/flags";
import { applyAction, SAFE_DEAL_UNAVAILABLE, validateDraft } from "@/lib/deals/machine";
import type { Deal, DealDraft } from "@/lib/deals/types";
import { legalLinks } from "@/lib/legal/links";
import { proposeDeal } from "@/lib/server/deal-repo";
import { cryptoPublic, legalFlags, phonePublic, safeDealEnabledFor, safeDealMode, safeDealPublic } from "@/lib/server/safe-deal";
import { makeUser, useTestD1 } from "../helpers/d1";

// Режим безпечної угоди: off (типово), allowlist, on. Чиста машина отримує рішення параметром, сервер читає змінні.

const performer = { id: "me-flag-perf", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true };
const draft = (over: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "r-flag",
  responseId: "resp-flag",
  performer,
  method: "safe",
  stages: [{ title: "Робота", amount: 10000, days: 7 }],
  ...over,
});

const CRYPTO_MODES = ["CRYPTO_PROOF_MODE", "CRYPTO_WALLET_MODE", "CRYPTO_ESCROW_MODE"] as const;

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "flag-c");
});
afterAll(async () => {
  delete process.env.SAFE_DEAL_MODE;
  delete process.env.SAFE_DEAL_USERS;
  for (const name of CRYPTO_MODES) delete process.env[name];
  await ctx.close();
});

describe("режим безпечної угоди", () => {
  it("за замовчуванням і для сміття це off: помилка в змінній не вмикає гроші", () => {
    for (const raw of [undefined, "", "yes", "ON ?", "true", "1"]) expect(parseFeatureMode(raw)).toBe("off");
    expect(parseFeatureMode(" Allowlist ")).toBe("allowlist");
    expect(parseFeatureMode("on")).toBe("on");
  });

  it("allowlist пускає лише пошти зі списку без урахування регістру й пробілів; off нікого; on всіх", () => {
    const users = parseFeatureUsers(" Max@Example.com, ,anna@example.com ");
    expect(users).toEqual(["max@example.com", "anna@example.com"]);
    expect(featureAllowed({ mode: "allowlist", users }, "MAX@example.com")).toBe(true);
    expect(featureAllowed({ mode: "allowlist", users }, "other@example.com")).toBe(false);
    expect(featureAllowed({ mode: "allowlist", users }, null)).toBe(false);
    expect(featureAllowed({ mode: "off", users }, "max@example.com")).toBe(false);
    expect(featureAllowed({ mode: "on", users: [] }, "any@example.com")).toBe(true);
  });

  it("сервер читає змінні; юридичні тексти бачать безпечну угоду лише в режимі on", async () => {
    delete process.env.SAFE_DEAL_MODE;
    expect(await safeDealMode()).toBe("off");
    expect(await safeDealEnabledFor("max@example.com")).toBe(false);
    expect(await safeDealPublic()).toBe(false);
    process.env.SAFE_DEAL_MODE = "allowlist";
    process.env.SAFE_DEAL_USERS = "max@example.com";
    expect(await safeDealEnabledFor("max@example.com")).toBe(true);
    expect(await safeDealEnabledFor("other@example.com")).toBe(false);
    expect(await safeDealPublic()).toBe(false);
    process.env.SAFE_DEAL_MODE = "on";
    expect(await safeDealEnabledFor("other@example.com")).toBe(true);
    expect(await safeDealPublic()).toBe(true);
    delete process.env.SAFE_DEAL_MODE;
  });
});

describe("видимість крипти в юридичних текстах", () => {
  it("cryptoPublic: істина, лише коли будь-яка з трьох крипто-функцій у режимі on; allowlist не рахується", async () => {
    for (const name of CRYPTO_MODES) delete process.env[name];
    expect(await cryptoPublic()).toBe(false);
    process.env.CRYPTO_PROOF_MODE = "allowlist";
    process.env.CRYPTO_PROOF_USERS = "max@example.com";
    expect(await cryptoPublic()).toBe(false);
    for (const name of CRYPTO_MODES) {
      process.env[name] = "on";
      expect(await cryptoPublic(), name).toBe(true);
      delete process.env[name];
    }
    delete process.env.CRYPTO_PROOF_USERS;
  });

  it("phonePublic: лише режим on, allowlist і off політику не змінюють", async () => {
    delete process.env.PHONE_VERIFY_MODE;
    expect(await phonePublic()).toBe(false);
    process.env.PHONE_VERIFY_MODE = "allowlist";
    process.env.PHONE_VERIFY_USERS = "max@example.com";
    expect(await phonePublic()).toBe(false);
    process.env.PHONE_VERIFY_MODE = "on";
    expect(await phonePublic()).toBe(true);
    expect((await legalFlags()).phone).toBe(true);
    delete process.env.PHONE_VERIFY_MODE;
    delete process.env.PHONE_VERIFY_USERS;
  });

  it("legalFlags збирає обидва прапорці незалежно", async () => {
    delete process.env.SAFE_DEAL_MODE;
    process.env.CRYPTO_ESCROW_MODE = "on";
    expect(await legalFlags()).toEqual({ safeDeal: false, crypto: true, phone: false });
    process.env.SAFE_DEAL_MODE = "on";
    delete process.env.CRYPTO_ESCROW_MODE;
    expect(await legalFlags()).toEqual({ safeDeal: true, crypto: false, phone: false });
    delete process.env.SAFE_DEAL_MODE;
  });
});

describe("безпечна угода вимкнена для людини", () => {
  it("чернетку з методом safe відхиляє навіть для ФОП, прямий переказ проходить", () => {
    expect(validateDraft(draft(), false)).toBe(SAFE_DEAL_UNAVAILABLE);
    expect(validateDraft(draft({ method: "direct" }), false)).toBeNull();
    expect(validateDraft(draft(), true)).toBeNull();
  });

  it("створення safe-угоди в репозиторії повертає помилку й нічого не пише", async () => {
    expect(await proposeDeal("flag-c", draft(), { safeEnabled: false, now: 1_000_000 })).toBe(SAFE_DEAL_UNAVAILABLE);
    const direct = await proposeDeal("flag-c", draft({ method: "direct" }), { safeEnabled: false, now: 1_000_001 });
    expect(typeof direct).toBe("object");
  });

  it("дія fund ніколи не міняє стан: «заморожено» ставить лише банк", () => {
    const stored: Deal = {
      id: "deal-old",
      requestId: "r-flag",
      responseId: "resp-old",
      performer,
      method: "safe",
      status: "accepted",
      stages: [{ id: "s1", title: "Робота", amount: 10000, days: 7, status: "pending" }],
      createdAt: new Date(0).toISOString(),
      number: "#OLD1",
    };
    expect(applyAction(stored, "fund", undefined, 1_000_000)).toMatch(/через сторінку банку/);
  });

  it("оферти для виконавців немає в списку документів, поки режим не on", () => {
    expect(legalLinks(false).some((link) => link.href === "/offer/safe-deal")).toBe(false);
    expect(legalLinks(true).some((link) => link.href === "/offer/safe-deal")).toBe(true);
  });
});
