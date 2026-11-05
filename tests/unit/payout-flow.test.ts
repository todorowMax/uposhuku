import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", async () => ({
  getSessionUser: async () => (await import("../helpers/money-mocks")).session.user,
  devCode: () => ({ code: "000000", private: false }),
}));
vi.mock("@/lib/server/admin", async () => ({ getAdmin: async () => (await import("../helpers/money-mocks")).admin.user }));
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: async () => true }));
vi.mock("@/lib/server/notify", async () => ({ notifyLater: (await import("../helpers/money-mocks")).notifyLater, notifyUser: vi.fn() }));
vi.mock("@/lib/server/mail", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")),
  sendAdminNotice: (await import("../helpers/money-mocks")).adminMail,
  sendReleaseCodeMail: (await import("../helpers/money-mocks")).codeMail,
}));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { payoutAccounts } from "@/db/schema";
import { POST as VERIFY } from "@/app/api/admin/payouts/[userId]/verify/route";
import { PUT as APPLY, GET as OWN } from "@/app/api/payout-account/route";
import { POST as DECIDE } from "@/app/api/admin/disputes/[id]/decision/route";
import { POST as RELEASE_CODE } from "@/app/api/deals/[id]/release-code/route";
import { totpCode, decodeBase32 } from "@/lib/admin/totp";
import { getDb } from "@/lib/server/db";
import { runDealSweep } from "@/lib/server/deal-sweep";
import { getPayoutAccount } from "@/lib/server/payment-repo";
import { overLimit } from "@/lib/server/rate-limit";
import { act, callsFor, ctxFor, delivered, initMoneyDb, newDeal, pay, PERF_TAX_ID, setupMoneyEnv, stageOf, teardownMoneyEnv, DAY } from "../helpers/money-harness";
import { admin, adminMail, bank, codeMail, session } from "../helpers/money-mocks";
import { actAsPerformer } from "@/lib/server/deal-repo";
import { makeUser } from "../helpers/d1";

const TAX_ID = "3012345670";
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

let ctx: Awaited<ReturnType<typeof initMoneyDb>>;
beforeAll(async () => {
  ctx = await initMoneyDb();
  for (const id of ["pf-new", "pf-adm"]) await makeUser(ctx.db, id, { createdAt: Date.now() - 30 * DAY });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await setupMoneyEnv();
  admin.user = { id: "pf-adm", email: "boss@example.com" };
  codeMail.mockReset();
});
afterEach(() => {
  teardownMoneyEnv();
  delete process.env.ADMIN_TOTP_SECRET;
  delete process.env.DEPLOY_ENV;
});

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const apply = (body: Record<string, unknown>) => APPLY(new Request("https://findlyfy.test/api/payout-account", { method: "PUT", body: JSON.stringify(body) }));
const verify = (userId: string) => VERIFY(new Request("https://findlyfy.test/x", { method: "POST" }), { params: Promise.resolve({ userId }) });
const decide = (dealId: string, body: Record<string, unknown>) => DECIDE(new Request("https://findlyfy.test/x", json({ comment: "Рішення модератора за матеріалами.", ...body })), ctxFor(dealId));

describe("підключення виконавця до виплат", () => {
  const FORM = { fopName: "ФОП Новий", taxId: TAX_ID, accountConfirmed: true, consent: true };

  it("заявка: pending, ІПН у базі лише шифротекстом, у відповіді лише маска; активний рахунок не переписується", async () => {
    session.user = { id: "pf-new", email: "pf-new@example.com" };
    const response = await apply(FORM);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { payout: { status: string; taxIdMask: string } };
    expect(body.payout).toMatchObject({ status: "pending", taxIdMask: "30******70" });
    expect(JSON.stringify(body)).not.toContain(TAX_ID);
    const [row] = await getDb().select().from(payoutAccounts).where(eq(payoutAccounts.userId, "pf-new"));
    expect(row.taxId).not.toContain(TAX_ID);
    expect(row.status).toBe("pending");
    expect(row.consentAt).not.toBeNull();
    // Поки не перевірено в банку, платити такому виконавцю не можна, а свій GET повертає стан без ІПН.
    expect(JSON.stringify(await (await OWN()).json())).not.toContain(TAX_ID);

    expect((await apply({ ...FORM, taxId: "1234567890" })).status).toBe(400);
    expect((await apply({ ...FORM, consent: false })).status).toBe(400);

    await getDb().update(payoutAccounts).set({ status: "active" }).where(eq(payoutAccounts.userId, "pf-new"));
    expect((await apply(FORM)).status).toBe(409);
    await getDb().update(payoutAccounts).set({ status: "pending" }).where(eq(payoutAccounts.userId, "pf-new"));
  });

  it("безпечна угода вимкнена: форма недоступна", async () => {
    session.user = { id: "pf-new", email: "pf-new@example.com" };
    process.env.SAFE_DEAL_MODE = "off";
    expect(await (await OWN()).json()).toMatchObject({ available: false, payout: null });
    expect((await apply(FORM)).status).toBe(409);
  });

  it("«перевірити в банку»: збіг ІПН зі списком банку вмикає рахунок, відсутній ІПН ні; чужому 404", async () => {
    session.user = { id: "pf-new", email: "pf-new@example.com" };
    await apply(FORM);
    bank.state.receivers = [{ id: "r-other", edrpou: "1111111111", name: "Інший" }];
    const miss = await verify("pf-new");
    expect(miss.status).toBe(409);
    expect((await getPayoutAccount("pf-new", "monobank"))?.status).toBe("pending");

    bank.state.receivers.push({ id: "r-new", edrpou: TAX_ID, name: "ФОП Новий" });
    expect((await verify("pf-new")).status).toBe(200);
    expect(await getPayoutAccount("pf-new", "monobank")).toMatchObject({ status: "active", receiverId: "r-new" });

    admin.user = null;
    expect((await verify("pf-new")).status).toBe(404);
  });

  it("рахунок на оплату бере receiverId зі свіжого списку банку, а не з бази", async () => {
    // У тестовому середовищі банку id змінюються: у базі міг лишитися старий.
    bank.state.receivers = [{ id: "recv-fresh", edrpou: PERF_TAX_ID, name: "ФОП Юлія" }];
    const deal = await newDeal();
    expect((await pay(deal.id)).status).toBe(201);
    const basket = (bank.last("invoice/create")!.body!.merchantPaymInfo as { basketOrder: { splitReceiverId: string }[] }).basketOrder;
    expect(new Set(basket.map((item) => item.splitReceiverId))).toEqual(new Set(["recv-fresh", "recv-platform"]));
  });

  it("банк більше не знає ІПН виконавця: оплата 409; список недоступний: 502", async () => {
    bank.state.receivers = [];
    const deal = await newDeal();
    expect((await pay(deal.id)).status).toBe(409);
    bank.state.fail.set("split-receiver/list", 500);
    expect((await pay(deal.id)).status).toBe(502);
  });
});

describe("комісія 7% і ліміти оплати", () => {
  it("тіло card ігнорується, сума одна, у платежі card = any; корзина сходиться з сумою", async () => {
    const deal = await newDeal();
    const response = await (await import("@/app/api/deals/[id]/pay/route")).POST(new Request("https://findlyfy.test/x", json({ card: "ua" })), ctxFor(deal.id));
    expect(response.status).toBe(201);
    const created = bank.last("invoice/create")!.body as { amount: number; merchantPaymInfo: { basketOrder: { sum: number }[] } };
    expect(created.amount).toBe(9_000 * 100 * 1.07);
    expect(created.merchantPaymInfo.basketOrder.reduce((sum, item) => sum + item.sum, 0)).toBe(created.amount);
    const { findPaymentByInvoice } = await import("@/lib/server/payment-repo");
    expect(await findPaymentByInvoice("monobank", "inv-1")).toMatchObject({ card: "any" });
  });

  it("акаунт молодший за 7 днів не платить етап більший за 5 000 ₴", async () => {
    const young = { id: "pf-young", email: "pf-young@example.com" };
    await makeUser(ctx.db, young.id, { email: young.email });
    session.user = young;
    const { proposeDeal } = await import("@/lib/server/deal-repo");
    const make = async (amount: number, n: number) => {
      const deal = await proposeDeal(young.id, { requestId: "r-young", responseId: `resp-young-${n}`, method: "safe", performer: { id: "me-dm-perf", name: "Юлія", avatarIndex: 0, specialty: "", fop: true }, stages: [{ title: "Робота", amount, days: 5 }] }, { safeEnabled: true });
      if (typeof deal === "string") throw new Error(deal);
      await actAsPerformer("dm-perf", deal.id, "accept", undefined);
      return deal;
    };
    const big = await make(6_000, 1);
    const refused = await pay(big.id);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ title: "Ліміт для нового акаунта" });
    expect(bank.count("invoice/create")).toBe(0);
    expect((await pay((await make(5_000, 2)).id)).status).toBe(201);
  });

  it("оплата: після 10 звернень за вікно 429", async () => {
    const deal = await newDeal();
    const statuses: number[] = [];
    for (let index = 0; index < 11; index++) statuses.push((await pay(deal.id)).status);
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });

  it("лічильник частоти рахує вікно: старі звернення не заважають", async () => {
    const at = 1_000_000_000;
    for (let index = 0; index < 5; index++) expect(await overLimit("payoutApply", "u-rate", at)).toBe(false);
    expect(await overLimit("payoutApply", "u-rate", at + 1000)).toBe(true);
    expect(await overLimit("payoutApply", "u-rate", at + 61 * 60_000)).toBe(false);
    expect(await overLimit("payoutApply", "u-other", at)).toBe(false);
  });
});

describe("приймання від 10 000 ₴: код з пошти", () => {
  const BIG = 12_000;
  const sendCode = (dealId: string) => RELEASE_CODE(new Request("https://findlyfy.test/x", { method: "POST" }), ctxFor(dealId));
  const release = (dealId: string, code?: string) =>
    import("@/app/api/deals/[id]/route").then(({ POST }) => POST(new Request("https://findlyfy.test/x", json({ action: "release", ...(code ? { code } : {}) })), ctxFor(dealId)));

  it("без коду 403 і банк не викликається; невірний код 403; вірний платить один раз; код одноразовий", async () => {
    const { deal, invoiceId } = await delivered(BIG);
    expect((await release(deal.id)).status).toBe(403);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(0);
    expect((await sendCode(deal.id)).status).toBe(200);
    expect(codeMail).toHaveBeenCalledTimes(1);
    expect(codeMail.mock.calls[0][1]).toBe("000000");
    expect((await release(deal.id, "111111")).status).toBe(403);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(0);
    expect((await release(deal.id, "000000")).status).toBe(200);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
    expect((await stageOf(deal.id)).status).toBe("releasing");
    // Етап уже виплачується: повторне приймання тим самим кодом банк вдруге не викличе.
    expect((await release(deal.id, "000000")).status).toBe(409);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
  });

  it("повторний запит коду раніше ніж за хвилину нового листа не шле; після 5 помилок код мертвий", async () => {
    const { deal } = await delivered(BIG);
    await sendCode(deal.id);
    await sendCode(deal.id);
    expect(codeMail).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 5; index++) await release(deal.id, "222222");
    expect((await release(deal.id, "000000")).status).toBe(403);
  });

  it("для етапу менше 10 000 ₴ код не потрібен і не надсилається", async () => {
    const { deal } = await delivered(9_999);
    expect((await sendCode(deal.id)).status).toBe(409);
    expect((await release(deal.id)).status).toBe(200);
  });

  it("автоприймання коду не потребує", async () => {
    const { deal, invoiceId } = await delivered(BIG);
    const deliveredAt = Date.parse((await stageOf(deal.id)).deliveredAt!);
    const report = await runDealSweep(deliveredAt + 7 * DAY);
    expect(report.errors).toBe(0);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
    expect(await stageOf(deal.id)).toMatchObject({ status: "releasing", autoAccepted: true });
  });
});

describe("грошові рішення модератора: другий фактор", () => {
  const disputed = async () => {
    const state = await delivered();
    await act(state.deal.id, "dispute");
    return state;
  };
  const code = async () => totpCode(decodeBase32(SECRET)!, Math.floor(Date.now() / 1000 / 30));

  it("на проді без ADMIN_TOTP_SECRET грошове рішення недоступне, rework працює", async () => {
    process.env.DEPLOY_ENV = "production";
    const { deal } = await disputed();
    const refused = await decide(deal.id, { action: "refund" });
    expect(refused.status).toBe(403);
    expect((await stageOf(deal.id)).status).toBe("disputed");
    expect(bank.count("invoice/cancel")).toBe(0);
    expect((await decide(deal.id, { action: "rework" })).status).toBe(200);
  });

  it("із секретом: без коду і з чужим кодом 403 (етап не змінився), з вірним виплата йде й власнику лист", async () => {
    process.env.ADMIN_TOTP_SECRET = SECRET;
    const { deal, invoiceId } = await disputed();
    expect((await decide(deal.id, { action: "release" })).status).toBe(403);
    expect((await decide(deal.id, { action: "release", totp: "000000" })).status).toBe(403);
    expect((await stageOf(deal.id)).status).toBe("disputed");
    expect(callsFor("invoice/finalize", invoiceId)).toBe(0);
    expect(adminMail).not.toHaveBeenCalled();

    expect((await decide(deal.id, { action: "release", totp: await code() })).status).toBe(200);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
    expect(adminMail).toHaveBeenCalledTimes(1);
    expect(adminMail.mock.calls[0][0]).toEqual(["boss@example.com"]);
    expect(adminMail.mock.calls[0][2]).toContain(deal.number);
  });

  it("часткова виплата і повернення теж потребують коду; rework ні", async () => {
    process.env.ADMIN_TOTP_SECRET = SECRET;
    const { deal } = await disputed();
    expect((await decide(deal.id, { action: "partial", percent: 50, confirm: true })).status).toBe(403);
    expect((await decide(deal.id, { action: "refund" })).status).toBe(403);
    expect((await decide(deal.id, { action: "rework" })).status).toBe(200);
    expect(adminMail).not.toHaveBeenCalled();
  });

  it("підбір коду обмежений: після 10 спроб 429", async () => {
    process.env.ADMIN_TOTP_SECRET = SECRET;
    const { deal } = await disputed();
    const statuses: number[] = [];
    for (let index = 0; index < 11; index++) statuses.push((await decide(deal.id, { action: "refund", totp: "000000" })).status);
    expect(statuses.slice(0, 10).every((status) => status === 403)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
