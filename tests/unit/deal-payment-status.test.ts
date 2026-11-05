import { describe, expect, it } from "vitest";
import { applyHoldExpiryRefund, applyAutoAccept, revertPayout } from "@/lib/deals/machine";
import { applyPaymentStatus, type BankSnapshot } from "@/lib/deals/payment-status";
import { quoteStage } from "@/lib/deals/price";
import { addBusinessDays, planDealSweep } from "@/lib/deals/sweep-plan";
import { HOLD_DAYS, type Deal, type DealStage } from "@/lib/deals/types";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-02T10:00:00Z"); // понеділок
const iso = (ms: number) => new Date(ms).toISOString();
const TOTAL = quoteStage(10_000, "ua").total;
const ours = { amount: TOTAL, card: "ua" as const };

const deal = (stage: Partial<DealStage>): Deal => ({
  id: "d1",
  requestId: "r",
  responseId: "x",
  performer: { id: "me-p", name: "П", avatarIndex: 0, specialty: "", fop: true },
  method: "safe",
  status: "accepted",
  createdAt: iso(T0),
  number: "#D1",
  stages: [{ id: "s1", title: "Робота", amount: 10_000, days: 5, status: "pending", ...stage }],
});
const bankOf = (status: BankSnapshot["status"], over: Partial<BankSnapshot> = {}): BankSnapshot => ({ status, amount: TOTAL, ...over });
const apply = (d: Deal, snapshot: BankSnapshot, now = T0 + DAY) => applyPaymentStatus(d, { stageId: "s1", bank: snapshot, ours }, now);
const statusAfter = (d: Deal, snapshot: BankSnapshot) => {
  const result = apply(d, snapshot);
  if (result.kind !== "ok") throw new Error(result.reason);
  return result.deal.stages[0].status;
};

describe("applyPaymentStatus: стан етапу за словом банку", () => {
  it("hold на оплачуваному етапі → funded; відлік холду від часу банку, а не від звірки", () => {
    const result = apply(deal({}), bankOf("hold", { at: T0 }), T0 + 5 * DAY);
    expect(result.kind === "ok" && result.deal.stages[0]).toMatchObject({ status: "funded", holdUntil: iso(T0 + HOLD_DAYS * DAY) });
    expect(result.kind === "ok" && result.deal.stages[0].payment?.total).toBe(TOTAL);
  });

  it("сума банку чи етапу не збігається: аномалія, стан не змінено", () => {
    expect(apply(deal({}), bankOf("hold", { amount: TOTAL - 1 }))).toEqual({ kind: "anomaly", reason: "amount_mismatch" });
    expect(applyPaymentStatus(deal({ amount: 9_999 }), { stageId: "s1", bank: bankOf("hold"), ours }, T0)).toEqual({ kind: "anomaly", reason: "hold_amount_differs_from_stage" });
    expect(apply(deal({}), bankOf("success"))).toEqual({ kind: "anomaly", reason: "success_without_hold" });
    expect(applyPaymentStatus(deal({}), { stageId: "nope", bank: bankOf("hold"), ours }, T0)).toEqual({ kind: "anomaly", reason: "stage_missing" });
  });

  it("повтор того самого статусу нічого не міняє (ідемпотентність)", () => {
    const once = apply(deal({}), bankOf("hold"));
    const again = once.kind === "ok" ? apply(once.deal, bankOf("hold")) : once;
    expect(again).toMatchObject({ kind: "ok", changed: false });
  });

  it("success: releasing → released з фактичною сумою; без нашого наміру теж правда за банком; created/processing нічого не міняють", () => {
    const releasing = deal({ status: "releasing", payout: { kind: "full" } });
    const result = apply(releasing, bankOf("success", { finalAmount: 777 }));
    expect(result.kind === "ok" && result.deal.stages[0]).toMatchObject({ status: "released", paidAmount: 777 });
    expect(result.kind === "ok" && result.deal.status).toBe("completed");
    expect(statusAfter(deal({ status: "delivered" }), bankOf("success"))).toBe("released");
    for (const status of ["created", "processing"] as const) expect(statusAfter(deal({ status: "releasing" }), bankOf(status))).toBe("releasing");
  });

  it("failure після холду етап не чіпає; expired: funded → pending, після здачі → refunded; reversed → refunded й угода скасована", () => {
    expect(apply(deal({ status: "funded" }), bankOf("failure"))).toEqual({ kind: "anomaly", reason: "failure_after_hold" });
    expect(statusAfter(deal({ status: "delivered" }), bankOf("failure"))).toBe("delivered");
    expect(statusAfter(deal({ status: "pending" }), bankOf("failure"))).toBe("pending");
    expect(statusAfter(deal({ status: "funded", fundedAt: iso(T0), holdUntil: iso(T0 + 30 * DAY) }), bankOf("expired"))).toBe("pending");
    expect(statusAfter(deal({ status: "delivered" }), bankOf("expired"))).toBe("refunded");
    const reversed = apply(deal({ status: "refunding" }), bankOf("reversed"));
    expect(reversed.kind === "ok" && reversed.deal).toMatchObject({ status: "cancelled", stages: [{ status: "refunded" }] });
    expect(statusAfter(deal({ status: "pending" }), bankOf("reversed"))).toBe("pending");
  });
});

describe("наміри й відкат", () => {
  it("autoAccept лише для здано, холд-повернення лише для funded; revertPayout повертає звідки пішли", () => {
    expect(applyAutoAccept(deal({ status: "funded" }), "s1", T0)).toMatch(/не застосовне/);
    const accepted = applyAutoAccept(deal({ status: "delivered" }), "s1", T0) as Deal;
    expect(accepted.stages[0]).toMatchObject({ status: "releasing", autoAccepted: true, revertTo: "delivered" });
    const reverted = revertPayout(accepted, "s1", "Банк не прийняв") as Deal;
    expect(reverted.stages[0]).toMatchObject({ status: "delivered", payoutError: "Банк не прийняв" });
    expect(reverted.stages[0].payout).toBeUndefined();

    expect(applyHoldExpiryRefund(deal({ status: "delivered" }), "s1", T0)).toMatch(/не застосовне/);
    const refunding = applyHoldExpiryRefund(deal({ status: "funded" }), "s1", T0) as Deal;
    expect(refunding.stages[0]).toMatchObject({ status: "refunding", refundReason: "hold_expiry", revertTo: "funded" });
    expect((revertPayout(refunding, "s1", "x") as Deal).stages[0].status).toBe("funded");
    expect(revertPayout(deal({ status: "delivered" }), "s1", "x")).toMatch(/не чекає/);
  });
});

describe("planDealSweep: що робити з угодою (чиста функція)", () => {
  const kinds = (d: Deal, now: number) => planDealSweep(d, now).map((action) => action.kind);

  it("робочі дні: п'ятниця + 3 робочих = середа; вихідні не рахуються", () => {
    const friday = Date.parse("2026-11-06T12:00:00Z");
    expect(addBusinessDays(friday, 3)).toBe(Date.parse("2026-11-11T12:00:00Z"));
    expect(addBusinessDays(T0, 3)).toBe(T0 + 3 * DAY);
  });

  it("автоприймання рівно після терміну, не раніше; не повторюємо після відмови банку", () => {
    const delivered = deal({ status: "delivered", deliveredAt: iso(T0), holdUntil: iso(T0 + 25 * DAY) });
    expect(kinds(delivered, T0 + 3 * DAY - 1)).toEqual([]);
    expect(kinds(delivered, T0 + 3 * DAY)).toEqual(["auto_accept"]);
    const rejected = deal({ status: "delivered", deliveredAt: iso(T0), holdUntil: iso(T0 + 25 * DAY), payoutError: "Банк не прийняв" });
    expect(kinds(rejected, T0 + 9 * DAY)).toEqual([]);
  });

  it("releasing/refunding довершуємо за 5 хвилин, не раніше", () => {
    const releasing = deal({ status: "releasing", releasingAt: iso(T0) });
    expect(kinds(releasing, T0 + 4 * 60_000)).toEqual([]);
    expect(kinds(releasing, T0 + 5 * 60_000)).toEqual(["settle"]);
    expect(kinds(deal({ status: "refunding", refundingAt: iso(T0) }), T0 + 6 * 60_000)).toEqual(["settle"]);
  });

  it("холд: попередження за 2 доби (один раз), скасування за добу для не зданого, лист адмінам для спору", () => {
    const end = T0 + 30 * DAY;
    const funded = deal({ status: "funded", holdUntil: iso(end) });
    expect(kinds(funded, end - 3 * DAY)).toEqual([]);
    expect(kinds(funded, end - 36 * 60 * 60_000)).toEqual(["warn_hold_ending"]);
    expect(kinds({ ...funded, stages: [{ ...funded.stages[0], holdWarnedAt: iso(T0) }] }, end - 36 * 60 * 60_000)).toEqual([]);
    expect(kinds(funded, end - 12 * 60 * 60_000)).toEqual(["cancel_hold"]);
    const disputed = deal({ status: "disputed", holdUntil: iso(end) });
    expect(kinds(disputed, end - 36 * 60 * 60_000)).toEqual(["warn_hold_ending", "alert_admins"]);
    expect(kinds(deal({ status: "disputed", holdUntil: iso(end), holdWarnedAt: iso(T0), holdAlertAt: iso(T0) }), end - DAY)).toEqual([]);
    // Холд уже минув: це справа банку, не sweep.
    expect(kinds(funded, end + 1)).toEqual([]);
  });

  it("прямі й неприйняті угоди не чіпаємо", () => {
    const direct = { ...deal({ status: "funded", holdUntil: iso(T0) }), method: "direct" as const };
    expect(kinds(direct, T0 + 40 * DAY)).toEqual([]);
    expect(kinds({ ...deal({ status: "delivered", deliveredAt: iso(T0) }), status: "proposed" }, T0 + 40 * DAY)).toEqual([]);
  });
});
