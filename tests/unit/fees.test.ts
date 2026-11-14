import { describe, expect, it } from "vitest";
import { createDeal } from "@/lib/deals/machine";
import type { Deal, DealDraft, DealStage } from "@/lib/deals/types";
import { accrualsFor, balanceOf, feeFor, isStagePaid, POSTPAID_FEE_BP, stageBaseKop } from "@/lib/fees/fees";
import { dueDateFor, quarterOf } from "@/lib/fees/period";

const T0 = Date.parse("2026-11-14T10:00:00Z");
const performer = { id: "p1", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true };
const draft = (over: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "r1",
  responseId: "resp1",
  performer,
  method: "direct",
  stages: [
    { title: "Макет", amount: 22_000, days: 7 },
    { title: "Верстка", amount: 10_000, days: 7 },
  ],
  ...over,
});
const make = (over: Partial<DealDraft> = {}, fee: Deal["fee"] | null = { rateBp: POSTPAID_FEE_BP }): Deal => ({ ...createDeal("deal_a1b2c3d4", draft(over), T0), ...(fee ? { fee } : {}) });
const withStatus = (deal: Deal, status: Deal["status"]): Deal => ({ ...deal, status });
const withStage = (deal: Deal, index: number, patch: Partial<DealStage>): Deal => ({
  ...deal,
  stages: deal.stages.map((stage, at) => (at === index ? { ...stage, ...patch } : stage)),
});

describe("feeFor", () => {
  it("5% від 22 000 ₴ це 1 100 ₴, усе в копійках", () => {
    expect(feeFor(2_200_000, 500)).toBe(110_000);
    expect(feeFor(stageBaseKop({ amount: 22_000 }), POSTPAID_FEE_BP)).toBe(110_000);
  });
  it("округлює до копійки, половина вгору, результат завжди ціле", () => {
    expect(feeFor(10_010, 500)).toBe(501); // 500.5
    expect(feeFor(10_009, 500)).toBe(500); // 500.45
    expect(feeFor(333, 500)).toBe(17); // 16.65
    expect(Number.isInteger(feeFor(12_345, 777))).toBe(true);
  });
  it("інша ставка з угоди дає іншу суму", () => {
    expect(feeFor(100_000, 250)).toBe(2_500);
  });
});

describe("isStagePaid", () => {
  const pending = make().stages[0];
  it("прямий переказ: оплачено з «Я оплатив(ла)» (claimed) і далі, pending ні", () => {
    const deal = make();
    expect(isStagePaid(deal, { ...pending, status: "pending" })).toBe(false);
    for (const status of ["claimed", "funded", "delivered", "released"] as const) expect(isStagePaid(deal, { ...pending, status })).toBe(true);
    expect(isStagePaid(deal, { ...pending, status: "refunded" })).toBe(false);
  });
  it("безпечна угода й ескроу не оплачені для комісії ніколи", () => {
    for (const method of ["safe", "escrow"] as const) {
      const deal = make({ method });
      for (const status of ["claimed", "funded", "released"] as const) expect(isStagePaid(deal, { ...pending, status, fundedAt: "2026-11-14T10:00:00Z", paidUnits: "5" })).toBe(false);
    }
  });
});

describe("accrualsFor", () => {
  it("claim_paid нараховує за цей етап: база, ставка і сума", () => {
    const before = make();
    const after = withStage(before, 0, { status: "claimed" });
    expect(accrualsFor(before, after)).toEqual([{ dealId: "deal_a1b2c3d4", stageId: "deal_a1b2c3d4-s1", baseKop: 2_200_000, rateBp: 500, amountKop: 110_000 }]);
  });
  it("confirm_paid після claim_paid нічого нового не нараховує", () => {
    const claimed = withStage(make(), 0, { status: "claimed" });
    expect(accrualsFor(claimed, withStage(claimed, 0, { status: "funded" }))).toEqual([]);
  });
  it("зміна без оплати нічого не нараховує", () => {
    const before = make();
    expect(accrualsFor(before, withStatus(before, "accepted"))).toEqual([]);
  });
  it("етап, що минув claimed (одразу funded), нараховується в першому оплаченому стані", () => {
    const before = make();
    expect(accrualsFor(before, withStage(before, 1, { status: "funded" })).map((item) => item.stageId)).toEqual(["deal_a1b2c3d4-s2"]);
  });
  it("completed доносить усі оплачені етапи, яких могло не бути в журналі", () => {
    const before = withStatus(withStage(withStage(make(), 0, { status: "released" }), 1, { status: "released" }), "accepted");
    const after = { ...before, status: "completed" as const };
    expect(accrualsFor(before, after).map((item) => item.stageId)).toEqual(["deal_a1b2c3d4-s1", "deal_a1b2c3d4-s2"]);
    expect(accrualsFor(after, after)).toEqual([]);
  });
  it("без fee в угоді нічого не нараховується, ставка береться з угоди", () => {
    const before = make({}, null);
    expect(accrualsFor(before, withStage(before, 0, { status: "claimed" }))).toEqual([]);
    const custom = make({}, { rateBp: 300 });
    expect(accrualsFor(custom, withStage(custom, 0, { status: "claimed" }))[0]).toMatchObject({ rateBp: 300, amountKop: 66_000 });
  });
  it("safe й escrow не нараховують, навіть якщо в них є fee", () => {
    for (const method of ["safe", "escrow"] as const) {
      const before = make({ method });
      expect(accrualsFor(before, withStatus(withStage(before, 0, { status: "funded", fundedAt: "2026-11-14T10:00:00Z" }), "completed"))).toEqual([]);
    }
  });
  it("перша поява угоди (before = null) нараховує за вже оплачені етапи", () => {
    expect(accrualsFor(null, withStage(make(), 0, { status: "claimed" }))).toHaveLength(1);
  });
});

describe("balanceOf", () => {
  it("нарахування плюс, оплата мінус, коригування зі знаком", () => {
    expect(balanceOf([])).toBe(0);
    expect(balanceOf([{ amountKop: 110_000 }, { amountKop: -50_000 }, { amountKop: -10_000 }])).toBe(50_000);
  });
});

describe("квартал і строк оплати (Київ)", () => {
  const iso = (value: string) => Date.parse(value);
  it("межа кварталу за київським часом, не за UTC", () => {
    expect(quarterOf(iso("2026-03-31T20:59:59Z"))).toEqual({ year: 2026, quarter: 1 }); // 23:59:59 за Києвом (літній час з 29.03)
    expect(quarterOf(iso("2026-03-31T21:00:00Z"))).toEqual({ year: 2026, quarter: 2 }); // 00:00 1 квітня
    expect(quarterOf(iso("2026-06-30T21:30:00Z"))).toEqual({ year: 2026, quarter: 3 }); // у UTC ще червень
    expect(quarterOf(iso("2026-09-30T20:59:59Z"))).toEqual({ year: 2026, quarter: 3 });
    expect(quarterOf(iso("2026-09-30T21:00:00Z"))).toEqual({ year: 2026, quarter: 4 });
  });
  it("межа року: 31 грудня ще IV квартал, 1 січня вже I наступного року", () => {
    expect(quarterOf(iso("2026-12-31T21:59:59Z"))).toEqual({ year: 2026, quarter: 4 });
    expect(quarterOf(iso("2026-12-31T22:00:00Z"))).toEqual({ year: 2027, quarter: 1 });
  });
  it("строк: кінець кварталу плюс 14 днів, до кінця дня за Києвом", () => {
    expect(dueDateFor(iso("2026-11-14T10:00:00Z"))).toBe("2027-01-14T21:59:59.999Z"); // зима, UTC+2
    expect(dueDateFor(iso("2026-02-10T10:00:00Z"))).toBe("2026-04-14T20:59:59.999Z"); // літо, UTC+3
    expect(dueDateFor(iso("2026-05-01T10:00:00Z"))).toBe("2026-07-14T20:59:59.999Z");
    expect(dueDateFor(iso("2026-08-20T10:00:00Z"))).toBe("2026-10-14T20:59:59.999Z");
  });
  it("строк на межах кварталу й року", () => {
    expect(dueDateFor(iso("2026-12-31T21:59:59Z"))).toBe("2027-01-14T21:59:59.999Z");
    expect(dueDateFor(iso("2026-12-31T22:00:00Z"))).toBe("2027-04-14T20:59:59.999Z");
    expect(dueDateFor(iso("2026-03-31T21:00:00Z"))).toBe("2026-07-14T20:59:59.999Z");
  });
});
