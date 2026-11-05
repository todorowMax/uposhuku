import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", async () => ({ getSessionUser: async () => (await import("../helpers/money-mocks")).session.user }));
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: async () => true }));
vi.mock("@/lib/server/notify", async () => ({ notifyLater: (await import("../helpers/money-mocks")).notifyLater, notifyUser: vi.fn() }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendAdminNotice: (await import("../helpers/money-mocks")).adminMail }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { actAsPerformer, getDealForOwner } from "@/lib/server/deal-repo";
import { runDealSweep } from "@/lib/server/deal-sweep";
import { findPaymentByInvoice } from "@/lib/server/payment-repo";
import { type useTestD1 } from "../helpers/d1";
import { adminMail, bank, notifyLater } from "../helpers/money-mocks";
import { act, callsFor, DAY, delivered, funded, initMoneyDb, newDeal, OWNER, pay, setupMoneyEnv, stageOf, teardownMoneyEnv, TOTAL } from "../helpers/money-harness";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await initMoneyDb();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(setupMoneyEnv);
afterEach(teardownMoneyEnv);

const noticesFor = (dealId: string, action: string) => notifyLater.mock.calls.filter((call) => String((call[1] as { key: string }).key).includes(`${dealId}:${action}`)).length;
const holdEnd = async (dealId: string) => Date.parse((await stageOf(dealId)).holdUntil!);

describe("фоновий прохід (sweep)", () => {
  it("автоприймання: мовчання після 3 робочих днів виплачує; до терміну нічого", async () => {
    const { deal, invoiceId } = await delivered();
    const deliveredAt = Date.parse((await stageOf(deal.id)).deliveredAt!);
    await runDealSweep(deliveredAt + 60 * 60_000);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(0);
    // Через 7 календарних днів минуло щонайменше 3 робочих.
    const report = await runDealSweep(deliveredAt + 7 * DAY);
    expect(report.errors).toBe(0);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
    expect(await stageOf(deal.id)).toMatchObject({ status: "releasing", autoAccepted: true });
    // Підсумок приносить банк: наступний прохід звіряє платіж і ставить «виплачено».
    bank.setStatus(invoiceId, "success", { finalAmount: TOTAL });
    await runDealSweep(deliveredAt + 7 * DAY + 600_000);
    expect((await stageOf(deal.id)).status).toBe("released");
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
  });

  it("releasing, який завис: до 5 хвилин не чіпаємо, пізніше повторюємо виклик, поки банк тримає холд", async () => {
    const { deal, invoiceId } = await delivered();
    bank.state.fail.set("invoice/finalize", "network");
    await act(deal.id, "release");
    expect((await stageOf(deal.id)).status).toBe("releasing");
    const releasingAt = Date.parse((await stageOf(deal.id)).releasingAt!);
    bank.state.fail.clear();
    bank.reset();
    await runDealSweep(releasingAt + 60_000);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(0);
    await runDealSweep(releasingAt + 6 * 60_000);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
    // Банк уже виконує: далі лише чекаємо, без нових викликів.
    await runDealSweep(releasingAt + 12 * 60_000);
    expect(callsFor("invoice/finalize", invoiceId)).toBe(1);
  });

  it("етап не здано, холд закінчується менш ніж за добу: холд скасовано, етап повернено, угода закрита", async () => {
    const { deal, invoiceId } = await funded();
    const end = await holdEnd(deal.id);
    await runDealSweep(end - 2 * DAY - 60_000);
    expect(callsFor("invoice/cancel", invoiceId)).toBe(0);
    await runDealSweep(end - 12 * 60 * 60_000);
    expect(callsFor("invoice/cancel", invoiceId)).toBe(1);
    const done = (await getDealForOwner(deal.id, OWNER.id))!;
    expect(done.stages[0]).toMatchObject({ status: "refunded", refundReason: "hold_expiry" });
    expect(done.status).toBe("cancelled");
  });

  it("за 2 доби до кінця холду сторони попереджені рівно один раз", async () => {
    const { deal } = await funded();
    const end = await holdEnd(deal.id);
    await runDealSweep(end - 36 * 60 * 60_000);
    expect(noticesFor(deal.id, "hold_ending")).toBe(2);
    expect((await stageOf(deal.id)).holdWarnedAt).toBeTruthy();
    await runDealSweep(end - 30 * 60 * 60_000);
    expect(noticesFor(deal.id, "hold_ending")).toBe(2);
  });

  it("спір біля кінця холду: лист адміністраторам один раз", async () => {
    const { deal } = await funded();
    await actAsPerformer("dm-perf", deal.id, "deliver", undefined);
    await act(deal.id, "dispute");
    const end = await holdEnd(deal.id);
    await runDealSweep(end - 3 * DAY);
    expect(adminMail).not.toHaveBeenCalled();
    await runDealSweep(end - 36 * 60 * 60_000);
    await runDealSweep(end - 30 * 60 * 60_000);
    expect(adminMail).toHaveBeenCalledTimes(1);
    expect(adminMail.mock.calls[0][0]).toEqual(["boss@example.com"]);
    expect(JSON.stringify(adminMail.mock.calls)).not.toContain("@example.com\",\"");
  });

  it("помилка в одній угоді не зупиняє решту", async () => {
    const broken = await funded();
    await actAsPerformer("dm-perf", broken.deal.id, "deliver", undefined);
    await act(broken.deal.id, "dispute");
    const healthy = await delivered();
    adminMail.mockRejectedValue(new Error("пошта лягла"));
    const end = await holdEnd(broken.deal.id);
    const deliveredAt = Date.parse((await stageOf(healthy.deal.id)).deliveredAt!);
    const report = await runDealSweep(Math.max(end - 36 * 60 * 60_000, deliveredAt + 7 * DAY));
    expect(report.errors).toBeGreaterThanOrEqual(1);
    // Здорову угоду все одно прийнято автоматично.
    expect((await stageOf(healthy.deal.id)).status).toBe("releasing");
    expect(bank.calls.some((call) => call.path === "invoice/finalize" && (call.body as { invoiceId: string }).invoiceId === healthy.invoiceId)).toBe(true);
  });

  it("сверка: рахунок, що прострочився без вебхука, стає expired; мертвий резерв знімається", async () => {
    const deal = await newDeal();
    await pay(deal.id);
    const invoiceId = [...bank.invoices.keys()].at(-1)!;
    bank.setStatus(invoiceId, "expired");
    await runDealSweep(Date.now());
    expect(await findPaymentByInvoice("monobank", invoiceId)).toMatchObject({ status: "expired" });

    const stuck = await newDeal();
    bank.state.fail.set("invoice/create", "network");
    await pay(stuck.id);
    bank.state.fail.clear();
    await runDealSweep(Date.now() + 20 * 60_000);
    const row = await ctx.db.prepare("select status from deal_payments where deal_id = ?").bind(stuck.id).first<{ status: string }>();
    expect(row?.status).toBe("failure");
  });
});
