import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
const bank = vi.hoisted(() => ({ create: vi.fn(), status: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/monobank/client", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), createInvoice: bank.create, getInvoiceStatus: bank.status }));
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: bank.verify }));
vi.mock("@/lib/server/placement-paid", () => ({ announcePlacementPaid: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET as FEES } from "@/app/api/fees/route";
import { POST as INVOICE } from "@/app/api/fees/invoice/route";
import { GET as RECONCILE } from "@/app/api/fees/invoices/[id]/route";
import { POST as WEBHOOK } from "@/app/api/monobank/webhook/route";
import type { Deal } from "@/lib/deals/types";
import { RATE_RULES } from "@/lib/server/rate-limit";
import { actAsPerformer, actOnDeal, proposeDeal } from "@/lib/server/deal-repo";
import { accrueFees } from "@/lib/server/fee-repo";
import { saveFeatureSetting } from "@/lib/server/features";
import { makeUser, useTestD1 } from "../helpers/d1";
import { ctxOf, exhaust, jsonRequest } from "../helpers/route-fixtures";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const PERFORMER = { id: "me-fee-perf", name: "Виконавець", avatarIndex: 0, specialty: "", fop: false };
const OWNER = { id: "fee-cust", email: "fee-cust@example.com" };

beforeAll(async () => {
  process.env.MONOBANK_TOKEN = "test-token";
  ctx = await useTestD1();
  for (const id of ["fee-cust", "fee-perf", "fee-other", "fee-off", "fee-old"]) await makeUser(ctx.db, id);
  await saveFeatureSetting({ name: "postpaid_fee", setting: { mode: "allowlist", users: [OWNER.email] }, adminEmail: "admin@example.com" });
});
afterAll(async () => {
  delete process.env.MONOBANK_TOKEN;
  await ctx.close();
});
beforeEach(() => {
  session.user = OWNER;
  bank.create.mockReset();
  bank.status.mockReset();
  bank.verify.mockReset();
  bank.verify.mockResolvedValue(true);
});

interface Account {
  enabled: boolean;
  balanceKop: number;
  dueAt: string | null;
  entries: { kind: string; amountKop: number; dealNumber: string | null; stageTitle: string | null; baseKop: number | null; rateBp: number | null }[];
}
const account = async (): Promise<Account> => (await FEES()).json() as Promise<Account>;
let counter = 0;
/** Прийнята пряма угода власника з однією умовою на етап. */
const acceptedDeal = async (owner: string, amount: number, method: "direct" | "safe" | "escrow" = "direct"): Promise<Deal> => {
  counter += 1;
  const performer = method === "safe" ? { ...PERFORMER, fop: true } : PERFORMER;
  const deal = await proposeDeal(owner, { requestId: `r${counter}`, responseId: `x${counter}`, method, performer, stages: [{ title: "Макет", amount, days: 5 }] }, { safeEnabled: true, escrowMax: 1000 });
  if (typeof deal === "string") throw new Error(deal);
  return deal;
};
const claim = async (deal: Deal): Promise<void> => {
  await actAsPerformer("fee-perf", deal.id, "accept", undefined);
  const result = await actOnDeal("fee-cust", deal.id, "claim_paid", deal.stages[0].id);
  if (typeof result === "string" || !result) throw new Error(String(result));
};
const webhook = (invoiceId: string, state: string, over: { amount: number; finalAmount?: number; modifiedDate?: string }) =>
  WEBHOOK(
    new Request("https://findlyfy.test/api/monobank/webhook", {
      method: "POST",
      headers: { "x-sign": "sig" },
      body: JSON.stringify({ invoiceId, status: state, modifiedDate: "2026-11-14T10:00:00Z", ...over }),
    }),
  );

describe("нарахування комісії за фактом", () => {
  it("прапорець вимкнений для замовника: у угоді немає fee і журнал порожній", async () => {
    const deal = await acceptedDeal("fee-other", 1000);
    expect(deal.fee).toBeUndefined();
    session.user = { id: "fee-other", email: "fee-other@example.com" };
    expect(await account()).toEqual({ enabled: false, balanceKop: 0, dueAt: null, entries: [] });
  });

  it("safe й escrow не отримують fee навіть при ввімкненому прапорці", async () => {
    expect((await acceptedDeal("fee-cust", 1000, "safe")).fee).toBeUndefined();
    expect((await acceptedDeal("fee-cust", 100, "escrow")).fee).toBeUndefined();
  });

  it("повний шлях: claim_paid нараховує, confirm_paid не дублює, рахунок, вебхук success, повтор не дублює", async () => {
    const deal = await acceptedDeal("fee-cust", 22_000);
    expect(deal.fee).toEqual({ rateBp: 500 });
    await claim(deal);

    let state = await account();
    expect(state).toMatchObject({ enabled: true, balanceKop: 110_000 });
    expect(state.dueAt).toMatch(/T\d\d:59:59\.999Z$/);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ kind: "accrual", amountKop: 110_000, dealNumber: deal.number, stageTitle: "Макет", baseKop: 2_200_000, rateBp: 500 });

    // Виконавець підтверджує оплату вже після claimed: другого нарахування немає.
    await actAsPerformer("fee-perf", deal.id, "confirm_paid", deal.stages[0].id);
    expect((await account()).entries).toHaveLength(1);
    // Повторна подія тієї самої зміни теж нічого не додає (ідемпотентність за угодою й етапом).
    await accrueFees({ before: null, after: { ...deal, stages: [{ ...deal.stages[0], status: "funded" }] }, ownerUserId: "fee-cust" });
    expect((await account()).balanceKop).toBe(110_000);

    bank.create.mockResolvedValue({ invoiceId: "inv-fee-1", pageUrl: "https://pay.example/1" });
    const created = await INVOICE(jsonRequest("POST", {}, "https://findlyfy.test/api/fees/invoice"));
    expect(created.status).toBe(201);
    const { id, pageUrl } = (await created.json()) as { id: string; pageUrl: string };
    expect(pageUrl).toBe("https://pay.example/1");
    expect(bank.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 110_000, hold: false, reference: id, webHookUrl: "https://findlyfy.test/api/monobank/webhook", basketOrder: [{ name: "Комісія платформи Findlyfy", qty: 1, sum: 110_000, code: "platform_fee" }] }),
    );
    // Банк ще нічого не підтвердив: борг на місці.
    expect((await account()).balanceKop).toBe(110_000);

    expect((await webhook("inv-fee-1", "success", { amount: 110_000, finalAmount: 110_000 })).status).toBe(200);
    state = await account();
    expect(state.balanceKop).toBe(0);
    expect(state.entries.map((entry) => [entry.kind, entry.amountKop])).toEqual(expect.arrayContaining([["payment", -110_000], ["accrual", 110_000]]));

    expect((await webhook("inv-fee-1", "success", { amount: 110_000, finalAmount: 110_000, modifiedDate: "2026-11-14T10:00:05Z" })).status).toBe(200);
    state = await account();
    expect(state.balanceKop).toBe(0);
    expect(state.entries.filter((entry) => entry.kind === "payment")).toHaveLength(1);

    // Боргу немає: нового рахунку не буде.
    expect((await INVOICE(jsonRequest("POST", {}))).status).toBe(400);
  });

  it("не-success (processing, failure) оплату не пишуть, а часткова сума й межі суми перевіряються", async () => {
    const before = (await account()).balanceKop;
    const deal = await acceptedDeal("fee-cust", 5000); // 250 ₴ = 25 000 коп
    await claim(deal);
    expect((await account()).balanceKop).toBe(before + 25_000);

    expect((await INVOICE(jsonRequest("POST", { amountKop: 5_000 }))).status).toBe(400); // менше 100 ₴
    expect((await INVOICE(jsonRequest("POST", { amountKop: before + 25_001 }))).status).toBe(400); // більше за борг
    expect((await INVOICE(jsonRequest("POST", { amountKop: 100.5 }))).status).toBe(400);
    expect(bank.create).not.toHaveBeenCalled();

    bank.create.mockResolvedValue({ invoiceId: "inv-fee-2", pageUrl: "https://pay.example/2" });
    const created = await INVOICE(jsonRequest("POST", { amountKop: 20_000 }));
    expect(created.status).toBe(201);
    expect(bank.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 20_000 }));

    await webhook("inv-fee-2", "processing", { amount: 20_000 });
    await webhook("inv-fee-2", "failure", { amount: 20_000, modifiedDate: "2026-11-14T10:01:00Z" });
    expect((await account()).balanceKop).toBe(25_000);
    // Сума банку, що не збігається з рахунком, теж не зараховується.
    await webhook("inv-fee-2", "success", { amount: 19_999, modifiedDate: "2026-11-14T10:02:00Z" });
    expect((await account()).balanceKop).toBe(25_000);
  });

  it("звірка: чужий рахунок 404, свій добирає success із банку", async () => {
    bank.create.mockResolvedValue({ invoiceId: "inv-fee-3", pageUrl: "https://pay.example/3" });
    const { id } = (await (await INVOICE(jsonRequest("POST", { amountKop: 25_000 }))).json()) as { id: string };

    session.user = { id: "fee-other", email: "fee-other@example.com" };
    expect((await RECONCILE(new Request("https://findlyfy.test/x"), ctxOf({ id }))).status).toBe(404);
    expect(bank.status).not.toHaveBeenCalled();
    session.user = null;
    expect((await RECONCILE(new Request("https://findlyfy.test/x"), ctxOf({ id }))).status).toBe(401);

    session.user = OWNER;
    bank.status.mockResolvedValue({ invoiceId: "inv-fee-3", status: "success", amount: 25_000, finalAmount: 25_000, modifiedDate: "2026-11-14T11:00:00Z" });
    const done = await RECONCILE(new Request("https://findlyfy.test/x"), ctxOf({ id }));
    expect(await done.json()).toEqual({ status: "success", balanceKop: 0 });
  });

  it("«Оплату отримано» від виконавця без «Я оплатив(ла)»: нараховує один раз, пізніше «Я оплатив(ла)» відмовлено й не дублює", async () => {
    const before = (await account()).entries.length;
    const deal = await acceptedDeal("fee-cust", 4000);
    await actAsPerformer("fee-perf", deal.id, "accept", undefined);
    expect((await account()).entries).toHaveLength(before);
    const done = await actAsPerformer("fee-perf", deal.id, "confirm_paid", deal.stages[0].id);
    expect(typeof done).not.toBe("string");
    let state = await account();
    expect(state.entries).toHaveLength(before + 1);
    expect(state.entries[0]).toMatchObject({ kind: "accrual", amountKop: 20_000, dealNumber: deal.number });
    expect(await actOnDeal("fee-cust", deal.id, "claim_paid", deal.stages[0].id)).toMatch(/уже відмічено/);
    // Повтор тієї самої зміни не дублює запис (унікальний індекс за угодою й етапом).
    await accrueFees({ before: null, after: { ...deal, stages: [{ ...deal.stages[0], status: "funded" }] }, ownerUserId: "fee-cust" });
    state = await account();
    expect(state.entries).toHaveLength(before + 1);
  });

  it("GET /api/fees: строк від найстарішого нарахування, а не від поточного кварталу", async () => {
    const deal = await acceptedDeal("fee-old", 1000);
    const paid = { ...deal, fee: { rateBp: 500 }, stages: [{ ...deal.stages[0], status: "claimed" as const }] };
    await accrueFees({ before: null, after: paid, ownerUserId: "fee-old", now: Date.parse("2026-12-10T10:00:00Z") });
    session.user = { id: "fee-old", email: "fee-old@example.com" };
    expect((await account()).dueAt).toBe("2027-01-14T21:59:59.999Z");
  });

  it("рахунок без входу 401, без згод 409, понад ліміт 429", async () => {
    session.user = null;
    expect((await INVOICE(jsonRequest("POST", {}))).status).toBe(401);
    expect((await FEES()).status).toBe(401);
    await makeUser(ctx.db, "fee-nolegal", { accepted: false });
    session.user = { id: "fee-nolegal", email: "fee-nolegal@example.com" };
    expect((await INVOICE(jsonRequest("POST", {}))).status).toBe(409);
    await exhaust("feeInvoice", "fee-nolegal");
    expect(RATE_RULES.feeInvoice.max).toBeGreaterThan(0);
    expect((await INVOICE(jsonRequest("POST", {}))).status).toBe(429);
  });
});
