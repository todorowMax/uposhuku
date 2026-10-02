import { describe, expect, it } from "vitest";
import { addPayment, getPlacement } from "@/lib/placement/mock-store";
import { MIN_PAYMENT, PAID_TIERS, TIER_FROM, TIER_PX, isPromoted, outrank, tierForTotal, toNextTier } from "@/lib/placement/tiers";

describe("рівні розміщення", () => {
  it("без оплати — рівень 1, від 100 ₴ — 2, межі точні", () => {
    expect(tierForTotal(0)).toBe(1);
    expect(tierForTotal(99)).toBe(1);
    expect(tierForTotal(MIN_PAYMENT)).toBe(2);
    expect(tierForTotal(299)).toBe(2);
    expect(tierForTotal(300)).toBe(3);
    expect(tierForTotal(100_000)).toBe(6);
  });

  it("мінімальна оплата — перший платний рівень, сходи зростають, розмір маркера теж", () => {
    expect(TIER_FROM[2]).toBe(MIN_PAYMENT);
    const thresholds = PAID_TIERS.map((tier) => TIER_FROM[tier]);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(TIER_PX).toEqual([...TIER_PX].sort((a, b) => a - b));
    expect(TIER_PX).toHaveLength(6);
  });

  it("скільки докласти до наступного рівня", () => {
    expect(toNextTier(0)).toEqual({ tier: 2, extra: 100 });
    expect(toNextTier(250)).toEqual({ tier: 3, extra: 50 });
    expect(toNextTier(3000)).toBeNull();
  });

  it("позначка «Просування» — з першого платного рівня", () => {
    expect(isPromoted(1)).toBe(false);
    expect(isPromoted(2)).toBe(true);
  });

  it("скільки виконавців нижче за рівнем", () => {
    expect(outrank(3, [{ tier: 1 }, { tier: 2 }, { tier: 3 }, { tier: 5 }])).toBe(2);
    expect(outrank(1, [{ tier: 1 }])).toBe(0);
  });
});

describe("платежі розміщення (заглушка)", () => {
  it("сума накопичується, рівень росте й не падає, історія — нові першими", () => {
    expect(getPlacement("pay-a")).toMatchObject({ total: 0, tier: 1, payments: [] });
    expect(addPayment("pay-a", 100)).toMatchObject({ total: 100, tier: 2 });
    const placement = addPayment("pay-a", 200);
    expect(placement).toMatchObject({ total: 300, tier: 3 });
    expect(placement.payments.map((payment) => payment.amount)).toEqual([200, 100]);
    expect(placement.payments[0].tierAfter).toBe(3);
  });

  it("у різних людей окремі рахунки", () => {
    addPayment("pay-b", 3000);
    expect(getPlacement("pay-b").tier).toBe(6);
    expect(getPlacement("pay-c").tier).toBe(1);
  });
});
