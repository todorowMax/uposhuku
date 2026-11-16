// Захист грошових рішень модератора (lib/server/admin-money.ts) напряму, без маршрутів: що вважається грошовим рішенням,
// другий фактор (є секрет, немає секрету на проді й поза продом, чужі й повторні коди, ліміт спроб), облік кроку коду
// й листи власнику. Крізь маршрути це покрито в payout-flow.test.ts і features.test.ts (основні шляхи).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ sendAdminNotice: vi.fn() }));
vi.mock("@/lib/server/mail", () => mail);

import { eq } from "drizzle-orm";
import { adminTotpState } from "@/db/schema";
import { decodeBase32, totpCode } from "@/lib/admin/totp";
import type { Deal, ModeratorAction } from "@/lib/deals/types";
import { checkSecondFactor, claimTotpCounter, isMoneyDecision, notifyFeatureChange, notifyMoneyDecision } from "@/lib/server/admin-money";
import { getDb } from "@/lib/server/db";
import { makeUser, useTestD1 } from "../helpers/d1";

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const KEY = decodeBase32(SECRET)!;
const STEP_MS = 30_000;
const COUNTER = 60_000_000;
// Середина кроку: «зараз» не лежить на межі двох кроків.
const NOW = COUNTER * STEP_MS + 15_000;
const WINDOW = 10 * 60_000;

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  // Кожному тесту свій адміністратор: останній прийнятий крок і лічильник спроб зберігаються на людину.
  for (const id of ["am-claim", "am-claim-2", "am-ok", "am-prev", "am-next", "am-far", "am-bad", "am-garbage", "am-replay", "am-other", "am-rate", "am-prod", "am-dev", "am-badsecret", "am-order"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  mail.sendAdminNotice.mockReset();
});
afterEach(() => {
  for (const name of ["ADMIN_TOTP_SECRET", "DEPLOY_ENV", "ADMIN_EMAILS"]) delete process.env[name];
});

const code = (counter: number) => totpCode(KEY, counter);
const lastCounter = async (adminId: string) => (await getDb().select().from(adminTotpState).where(eq(adminTotpState.userId, adminId)))[0]?.lastCounter ?? null;
const forbidden = (title: string) => expect.objectContaining({ ok: false, status: 403, title });

describe("isMoneyDecision: що рухає гроші банку", () => {
  const dealOf = (method: Deal["method"]) => ({ method }) as Deal;

  it("безпечна угода: виплата, повернення й часткова виплата грошові, «на доопрацювання» ні", () => {
    for (const action of ["release", "refund", "partial"] as ModeratorAction[]) expect(isMoneyDecision(dealOf("safe"), action), action).toBe(true);
    expect(isMoneyDecision(dealOf("safe"), "rework")).toBe(false);
  });

  it("не безпечна угода (прямий розрахунок, ескроу): банк не чіпаємо, код не потрібен за жодної дії", () => {
    for (const method of ["direct", "escrow"] as Deal["method"][]) {
      for (const action of ["release", "refund", "partial", "rework"] as ModeratorAction[]) expect(isMoneyDecision(dealOf(method), action), `${method}/${action}`).toBe(false);
    }
  });
});

describe("claimTotpCounter: крок коду приймається лише строго новіший", () => {
  it("перший крок приймається, повтор і старіший ні, новіший так; значення в базі лише зростає", async () => {
    expect(await claimTotpCounter("am-claim", 100, 1)).toBe(true);
    expect(await lastCounter("am-claim")).toBe(100);
    expect(await claimTotpCounter("am-claim", 100, 2)).toBe(false);
    expect(await claimTotpCounter("am-claim", 99, 3)).toBe(false);
    expect(await lastCounter("am-claim")).toBe(100);
    expect(await claimTotpCounter("am-claim", 101, 4)).toBe(true);
    expect(await lastCounter("am-claim")).toBe(101);
  });

  it("двоє одночасних із тим самим кроком: проходить рівно один", async () => {
    const results = await Promise.all([claimTotpCounter("am-claim-2", 500, 1), claimTotpCounter("am-claim-2", 500, 1)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("крок одного адміністратора не блокує іншого", async () => {
    expect(await claimTotpCounter("am-other", 700, 1)).toBe(true);
    expect(await claimTotpCounter("am-ok", 700, 1)).toBe(true);
  });
});

describe("checkSecondFactor: без секрету", () => {
  it("на проді грошові рішення вимкнені (403), навіть якщо код вигаданий чи вірний", async () => {
    process.env.DEPLOY_ENV = "production";
    expect(await checkSecondFactor({ adminId: "am-prod", code: "123456", now: NOW })).toEqual(forbidden("Грошові рішення вимкнені"));
    expect(await checkSecondFactor({ adminId: "am-prod", code: await code(COUNTER), now: NOW })).toEqual(forbidden("Грошові рішення вимкнені"));
    expect(await lastCounter("am-prod")).toBeNull();
  });

  it("поза продом (локально, dev-воркер) код не питаємо", async () => {
    expect(await checkSecondFactor({ adminId: "am-dev", code: undefined, now: NOW })).toEqual({ ok: true });
    process.env.DEPLOY_ENV = "development";
    expect(await checkSecondFactor({ adminId: "am-dev", code: undefined, now: NOW })).toEqual({ ok: true });
  });
});

describe("checkSecondFactor: із секретом", () => {
  beforeEach(() => {
    process.env.ADMIN_TOTP_SECRET = SECRET;
  });

  it("вірний код поточного кроку проходить і запам'ятовується", async () => {
    expect(await checkSecondFactor({ adminId: "am-ok", code: await code(COUNTER), now: NOW })).toEqual({ ok: true });
    expect(await lastCounter("am-ok")).toBe(COUNTER);
  });

  it("сусідні кроки (±1) проходять, ±2 ні, і відхилений код нічого не запам'ятовує", async () => {
    expect(await checkSecondFactor({ adminId: "am-far", code: await code(COUNTER + 2), now: NOW })).toEqual(forbidden("Потрібен код другого фактора"));
    expect(await checkSecondFactor({ adminId: "am-far", code: await code(COUNTER - 2), now: NOW })).toEqual(forbidden("Потрібен код другого фактора"));
    expect(await lastCounter("am-far")).toBeNull();
    expect(await checkSecondFactor({ adminId: "am-prev", code: await code(COUNTER - 1), now: NOW })).toEqual({ ok: true });
    expect(await checkSecondFactor({ adminId: "am-next", code: await code(COUNTER + 1), now: NOW })).toEqual({ ok: true });
    expect(await lastCounter("am-next")).toBe(COUNTER + 1);
  });

  it("не код: відсутній, null, число, масив, не 6 цифр, літери: 403 і крок не записано", async () => {
    const valid = await code(COUNTER);
    for (const bad of [undefined, null, Number(valid), [valid], "", "12345", `${valid}0`, "abcdef", "0000 00x"]) {
      expect(await checkSecondFactor({ adminId: "am-garbage", code: bad, now: NOW }), String(JSON.stringify(bad))).toEqual(forbidden("Потрібен код другого фактора"));
    }
    expect(await lastCounter("am-garbage")).toBeNull();
  });

  it("сміття замість секрету (не base32): рішення закрите, а не відкрите", async () => {
    process.env.ADMIN_TOTP_SECRET = "!!! not base32 !!!";
    expect(await checkSecondFactor({ adminId: "am-badsecret", code: await code(COUNTER), now: NOW })).toEqual(forbidden("Потрібен код другого фактора"));
    expect(await checkSecondFactor({ adminId: "am-badsecret", code: "000000", now: NOW })).toEqual(forbidden("Потрібен код другого фактора"));
  });

  it("повтор того самого коду: 403 «Код уже використано»; старіший за прийнятий крок теж; інший адміністратор з тим кодом проходить", async () => {
    const used = await code(COUNTER + 1);
    expect(await checkSecondFactor({ adminId: "am-replay", code: used, now: NOW })).toEqual({ ok: true });
    expect(await checkSecondFactor({ adminId: "am-replay", code: used, now: NOW })).toEqual(forbidden("Код уже використано"));
    expect(await checkSecondFactor({ adminId: "am-replay", code: await code(COUNTER), now: NOW })).toEqual(forbidden("Код уже використано"));
    expect(await lastCounter("am-replay")).toBe(COUNTER + 1);
    expect(await checkSecondFactor({ adminId: "am-order", code: used, now: NOW })).toEqual({ ok: true });
  });

  it("кожна спроба рахується: після 10 помилкових навіть вірний код дає 429 і не записується; за вікном знову можна", async () => {
    for (let index = 0; index < 10; index++) expect(await checkSecondFactor({ adminId: "am-rate", code: "000000", now: NOW + index }), `спроба ${index + 1}`).toEqual(forbidden("Потрібен код другого фактора"));
    const blocked = await checkSecondFactor({ adminId: "am-rate", code: await code(COUNTER), now: NOW + 10 });
    expect(blocked).toEqual({ ok: false, status: 429, title: "Забагато спроб", detail: expect.any(String) });
    expect(await lastCounter("am-rate")).toBeNull();
    // Після вікна лічильник відкривається: вірний код проходить.
    const later = NOW + WINDOW + 60_000;
    expect(await checkSecondFactor({ adminId: "am-rate", code: await code(Math.floor(later / STEP_MS)), now: later })).toEqual({ ok: true });
  });

  it("без секрету на проді ліміт спроб не витрачається (відмова раніше)", async () => {
    delete process.env.ADMIN_TOTP_SECRET;
    process.env.DEPLOY_ENV = "production";
    for (let index = 0; index < 12; index++) expect(await checkSecondFactor({ adminId: "am-prod", code: "000000", now: NOW + index })).toEqual(forbidden("Грошові рішення вимкнені"));
    // Секрет з'явився: 12 відмов раніше не з'їли ліміт, вірний код проходить.
    process.env.ADMIN_TOTP_SECRET = SECRET;
    delete process.env.DEPLOY_ENV;
    expect(await checkSecondFactor({ adminId: "am-prod", code: await code(COUNTER), now: NOW + 20 })).toEqual({ ok: true });
  });
});

describe("листи власнику про грошові рішення", () => {
  const deal = { number: "D-0042" } as Deal;

  it("без ADMIN_EMAILS лист не йде", async () => {
    await notifyMoneyDecision({ deal, action: "release", stageAmount: 9000, adminEmail: "mod@example.com", bank: "Monobank" });
    await notifyFeatureChange({ feature: "safe_deal", mode: "on", users: 0, adminEmail: "mod@example.com" });
    expect(mail.sendAdminNotice).not.toHaveBeenCalled();
    process.env.ADMIN_EMAILS = " , ;";
    await notifyMoneyDecision({ deal, action: "release", stageAmount: 9000, adminEmail: "mod@example.com", bank: "Monobank" });
    expect(mail.sendAdminNotice).not.toHaveBeenCalled();
  });

  it("рішення: усі власники з пошти адмінів, номер угоди в темі, дія, сума й банк у тексті, без даних сторін", async () => {
    process.env.ADMIN_EMAILS = "Boss@Example.com, second@example.com";
    await notifyMoneyDecision({ deal, action: "refund", stageAmount: 9000, adminEmail: "mod@example.com", bank: "Monobank" });
    expect(mail.sendAdminNotice).toHaveBeenCalledTimes(1);
    const [emails, subject, text] = mail.sendAdminNotice.mock.calls[0] as [string[], string, string];
    expect(emails).toEqual(["boss@example.com", "second@example.com"]);
    expect(subject).toBe("Грошове рішення за угодою D-0042");
    expect(text).toContain("повернення замовнику");
    expect(text).toContain("9000 ₴");
    expect(text).toContain("Банк: Monobank");
    expect(text).toContain("mod@example.com");
  });

  it("відсоток у тексті лише для часткової виплати", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    await notifyMoneyDecision({ deal, action: "partial", percent: 35, stageAmount: 1000, adminEmail: "mod@example.com", bank: "Monobank" });
    await notifyMoneyDecision({ deal, action: "release", percent: 35, stageAmount: 1000, adminEmail: "mod@example.com", bank: "Monobank" });
    const [partial, release] = mail.sendAdminNotice.mock.calls.map((call) => call[2] as string);
    expect(partial).toContain("часткова виплата 35%");
    expect(release).toContain("виплата виконавцю,");
    expect(release).not.toContain("35%");
  });

  it("зміна прапорця: що, який режим, скільки пошт у списку й хто; самих пошт зі списку в листі немає", async () => {
    process.env.ADMIN_EMAILS = "boss@example.com";
    await notifyFeatureChange({ feature: "crypto_escrow", mode: "allowlist", users: 3, adminEmail: "mod@example.com" });
    const [emails, subject, text] = mail.sendAdminNotice.mock.calls[0] as [string[], string, string];
    expect(emails).toEqual(["boss@example.com"]);
    expect(subject).toBe("Змінено прапорець crypto_escrow");
    expect(text).toContain("режим allowlist");
    expect(text).toContain("пошт у списку 3");
  });
});
