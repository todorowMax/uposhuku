import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/mail", () => ({ sendRequisitesChangeNotice: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET as CONFIG } from "@/app/api/deals/config/route";
import { POST as DEAL_ACTION } from "@/app/api/deals/[id]/route";
import { GET as DEAL_REQUISITES } from "@/app/api/deals/[id]/requisites/route";
import { PUT } from "@/app/api/requisites/route";
import { TRON_USDT_CONTRACT } from "@/lib/crypto/tron";
import {
  maskOf,
  normalizePaypalUrl,
  normalizeWiseUrl,
  paymentMethods,
  validateRequisites,
  visibleRequisites,
  type Requisites,
} from "@/lib/deals/requisites";
import { performerIdOf } from "@/lib/deals/parties";
import { actAsPerformer, getDealById, proposeDeal } from "@/lib/server/deal-repo";
import { makeUser, useTestD1 } from "../helpers/d1";
import { IBAN, KEY } from "../helpers/escrow-fixtures";

const USDT = TRON_USDT_CONTRACT;
const OLD: Requisites = { recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678" };

describe("способи оплати: чиста частина", () => {
  it("старий запис лише з банком читається без міграції", () => {
    expect(paymentMethods(OLD)).toEqual(["bank"]);
    expect(maskOf(OLD)).toContain("UA21");
  });

  it("без IBAN маска це мітка способу, а не порожній рядок", () => {
    expect(maskOf({ usdtTrc20: USDT })).toBe(`USDT •••${USDT.slice(-4)}`);
    expect(maskOf({ paypalUrl: "https://paypal.me/max" })).toBe("PayPal");
    expect(maskOf({})).not.toBe("");
  });

  it("зберігається лише USDT; порожній набір і напівзаповнений банк відхиляються людською мовою", () => {
    expect(validateRequisites({ usdtTrc20: USDT })).toEqual({ ok: true, value: { usdtTrc20: USDT } });
    const empty = validateRequisites({});
    expect(empty).toMatchObject({ ok: false });
    expect((empty as { error: string }).error).toMatch(/хоча б один спосіб/);
    expect(validateRequisites({ recipient: "ФОП Іваненко", usdtTrc20: USDT })).toMatchObject({ ok: false, field: "iban" });
  });

  it("PayPal і Wise: точні хости й шляхи", () => {
    expect(normalizePaypalUrl("https://paypal.me/max.dev-1")).toBe("https://paypal.me/max.dev-1");
    expect(normalizePaypalUrl("https://www.paypal.com/paypalme/max/")).toBe("https://www.paypal.com/paypalme/max");
    expect(normalizeWiseUrl("https://wise.com/pay/me/max_1")).toBe("https://wise.com/pay/me/max_1");
    for (const bad of [
      "https://paypal.me.evil.com/max",
      "https://evilpaypal.me/max",
      "https://paypal.com/paypalme/max",
      "http://paypal.me/max",
      "https://user:pass@paypal.me/max",
      "https://paypal.me:444/max",
      "https://paypal.me/",
      "https://paypal.me/max/extra",
      "https://www.paypal.com/other/max",
    ])
      expect(normalizePaypalUrl(bad), bad).toBeNull();
    for (const bad of ["https://wise.com.evil.com/pay/me/max", "http://wise.com/pay/me/max", "https://u@wise.com/pay/me/max", "https://wise.com/pay/me/", "https://wise.com/send/max", "https://paypal.me/max"])
      expect(normalizeWiseUrl(bad), bad).toBeNull();
  });

  it("прапорці ховають крипту, гаманець і зарубіжні посилання", () => {
    const all: Requisites = { ...OLD, usdtTrc20: USDT, walletAddress: "0xabc", binanceId: "123456", paypalUrl: "https://paypal.me/m", wiseUrl: "https://wise.com/pay/me/m" };
    expect(paymentMethods(visibleRequisites(all, { crypto: false, wallet: false, foreign: false }))).toEqual(["bank"]);
    expect(paymentMethods(visibleRequisites(all, { crypto: true, wallet: true, foreign: true }))).toEqual(["bank", "usdt", "wallet", "binance", "paypal", "wise"]);
  });
});

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["pm-cust", "pm-usdt", "pm-none", "pm-bank"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  delete process.env.CRYPTO_PROOF_MODE;
  delete process.env.FOREIGN_LINKS_MODE;
  await ctx.close();
});
beforeEach(() => {
  process.env.REQUISITES_KEY = KEY;
  session.user = { id: "pm-cust", email: "pm-cust@example.com" };
});

const put = (userId: string, body: unknown) => {
  session.user = { id: userId, email: `${userId}@example.com` };
  return PUT(new Request("https://findlyfy.test/api/requisites", { method: "PUT", body: JSON.stringify(body) }));
};
const post = (body: unknown) => new Request("https://findlyfy.test/x", { method: "POST", body: JSON.stringify(body) });
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });

const acceptedDeal = async (performer: string, requestId: string) => {
  const deal = await proposeDeal("pm-cust", { requestId, responseId: requestId, method: "direct", performer: { id: performerIdOf(performer), name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, { safeEnabled: true });
  if (typeof deal === "string") throw new Error(deal);
  await actAsPerformer(performer, deal.id, "accept", undefined);
  return deal;
};

describe("способи оплати: сервер", () => {
  it("USDT без IBAN: збереження, снімок і читання угоди не падають, значень у methods немає", async () => {
    process.env.CRYPTO_PROOF_MODE = "on";
    expect((await put("pm-usdt", { usdtTrc20: USDT })).status).toBe(200);
    const deal = await acceptedDeal("pm-usdt", "pm-r1");
    session.user = { id: "pm-cust", email: "pm-cust@example.com" };
    const view = (await (await DEAL_REQUISITES(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).json()) as { requisites: Requisites; methods: string[]; mask: string };
    expect(view.methods).toEqual(["usdt"]);
    expect(view.requisites.iban).toBeUndefined();
    expect(view.mask).toContain("USDT");
  });

  it("PayPal без прапорця foreign_links не зберігається", async () => {
    delete process.env.FOREIGN_LINKS_MODE;
    expect((await put("pm-bank", { ...OLD, paypalUrl: "https://paypal.me/max" })).status).toBe(409);
    process.env.FOREIGN_LINKS_MODE = "on";
    expect((await put("pm-bank", { ...OLD, paypalUrl: "https://paypal.me/max" })).status).toBe(200);
  });

  it("/api/deals/config?performer= віддає лише назви способів", async () => {
    session.user = { id: "pm-cust", email: "pm-cust@example.com" };
    const ask = async (id: string) => (await CONFIG(new Request(`http://localhost/api/deals/config?performer=${performerIdOf(id)}`))).json() as Promise<{ methods: string[] }>;
    const usdt = await ask("pm-usdt");
    expect(usdt.methods).toEqual(["usdt"]);
    expect(JSON.stringify(usdt)).not.toContain(USDT);
    expect(JSON.stringify(await ask("pm-bank"))).not.toContain(IBAN);
    expect((await ask("pm-bank")).methods).toEqual(["bank", "paypal"]);
    expect((await ask("pm-none")).methods).toEqual([]);
  });

  it("«Я оплатив(ла)»: спосіб записується в етап, чужий і позасніпковий відхиляються", async () => {
    const deal = await acceptedDeal("pm-bank", "pm-r2");
    session.user = { id: "pm-cust", email: "pm-cust@example.com" };
    expect((await DEAL_ACTION(post({ action: "claim_paid", via: "cash" }), ctxOf(deal.id))).status).toBe(400);
    expect((await DEAL_ACTION(post({ action: "claim_paid" }), ctxOf(deal.id))).status).toBe(400);
    expect((await DEAL_ACTION(post({ action: "claim_paid", via: "wise" }), ctxOf(deal.id))).status).toBe(409);
    expect((await DEAL_ACTION(post({ action: "claim_paid", via: "usdt" }), ctxOf(deal.id))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("pending");
    expect((await DEAL_ACTION(post({ action: "claim_paid", via: "paypal" }), ctxOf(deal.id))).status).toBe(200);
    const stage = (await getDealById(deal.id))!.stages[0];
    expect(stage.status).toBe("claimed");
    expect(stage.paidVia).toBe("paypal");
  });

  it("виконавець без способів: оплату можна позначити без via, спосіб не записується", async () => {
    const deal = await acceptedDeal("pm-none", "pm-r3");
    session.user = { id: "pm-cust", email: "pm-cust@example.com" };
    expect((await DEAL_ACTION(post({ action: "claim_paid" }), ctxOf(deal.id))).status).toBe(200);
    expect((await getDealById(deal.id))!.stages[0].paidVia).toBeUndefined();
  });
});
