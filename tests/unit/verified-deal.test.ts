import { describe, expect, it } from "vitest";
import { isVerifiedDeal } from "@/lib/deals/verified";
import type { Deal, DealStage } from "@/lib/deals/types";

const stage = (patch: Partial<DealStage> = {}): DealStage => ({ id: "s1", title: "Етап", amount: 500, days: 3, status: "released", ...patch });
const deal = (method: Deal["method"], stages: DealStage[], status: Deal["status"] = "completed") => ({ method, status, stages });
const proofOf = (stageId: string) => ({ stageId });

describe("isVerifiedDeal", () => {
  it("безпечна угода: виплату підтвердив банк (paidAmount)", () => {
    expect(isVerifiedDeal(deal("safe", [stage({ paidAmount: 50000 })]), [])).toBe(true);
    expect(isVerifiedDeal(deal("safe", [stage()]), [])).toBe(false);
    expect(isVerifiedDeal(deal("safe", [stage({ paidAmount: 0 })]), [])).toBe(false);
  });

  it("ескроу: виплату підтвердив контракт (paidUnits)", () => {
    expect(isVerifiedDeal(deal("escrow", [stage({ paidUnits: "500000000" })]), [])).toBe(true);
    expect(isVerifiedDeal(deal("escrow", [stage()]), [])).toBe(false);
    expect(isVerifiedDeal(deal("escrow", [stage({ paidUnits: "0" })]), [])).toBe(false);
    expect(isVerifiedDeal(deal("escrow", [stage({ paidUnits: "не число" })]), [])).toBe(false);
  });

  it("прямий етап: потрібен запис у crypto_proofs саме цього етапу", () => {
    expect(isVerifiedDeal(deal("direct", [stage({ paidVia: "usdt" })]), [proofOf("s1")])).toBe(true);
    expect(isVerifiedDeal(deal("direct", [stage({ paidVia: "wallet" })]), [proofOf("s1")])).toBe(true);
    expect(isVerifiedDeal(deal("direct", [stage({ paidVia: "usdt" })]), [])).toBe(false);
    expect(isVerifiedDeal(deal("direct", [stage({ paidVia: "usdt" })]), [proofOf("other")])).toBe(false);
  });

  it("банк, Binance, PayPal і Wise не підтверджуються ніколи, навіть із чужим записом у proofs", () => {
    for (const paidVia of ["bank", "binance", "paypal", "wise"] as const) {
      expect(isVerifiedDeal(deal("direct", [stage({ paidVia })]), [proofOf("s1")]), paidVia).toBe(false);
    }
    expect(isVerifiedDeal(deal("direct", [stage()]), [])).toBe(false);
  });

  it("усі етапи мусять бути підтверджені, а угода завершена", () => {
    const two = [stage({ id: "a", paidVia: "usdt" }), stage({ id: "b", paidVia: "bank" })];
    expect(isVerifiedDeal(deal("direct", two), [proofOf("a"), proofOf("b")])).toBe(false);
    const both = [stage({ id: "a", paidVia: "usdt" }), stage({ id: "b", paidVia: "usdt" })];
    expect(isVerifiedDeal(deal("direct", both), [proofOf("a")])).toBe(false);
    expect(isVerifiedDeal(deal("direct", both), [proofOf("a"), proofOf("b")])).toBe(true);
    expect(isVerifiedDeal(deal("safe", [stage({ paidAmount: 1 })], "accepted"), [])).toBe(false);
    expect(isVerifiedDeal(deal("safe", [stage({ paidAmount: 1, status: "funded" })]), [])).toBe(false);
    expect(isVerifiedDeal(deal("safe", []), [])).toBe(false);
  });
});
