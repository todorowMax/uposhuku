import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoTotals } from "@/lib/placement/market";
import { addPayment, getPlacement, tiersByUser } from "@/lib/server/placement-repo";
import { makeUser, useTestD1 } from "../helpers/d1";
import { MIN_PAYMENT, TIER_FLOOR, quote, tierFor, toNextTier } from "@/lib/placement/pricing";
import { PAID_TIERS, TIER_PX, isPromoted, outrank } from "@/lib/placement/tiers";

describe("ціни рівнів", () => {
  it("без інших платників діє нижня межа, а мінімум завжди 100 ₴", () => {
    const prices = quote([]);
    expect(prices[2]).toBe(MIN_PAYMENT);
    expect(prices[3]).toBe(TIER_FLOOR[3]);
    expect(prices[6]).toBe(TIER_FLOOR[6]);
  });

  it("мінімум не залежить від інших, а вищі рівні дорожчають, коли платять більше", () => {
    const rich = Array.from({ length: 40 }, (_, index) => 5000 + index * 100);
    const prices = quote(rich);
    expect(prices[2]).toBe(MIN_PAYMENT);
    expect(prices[6]).toBeGreaterThan(TIER_FLOOR[6]);
    expect(prices[3]).toBeGreaterThan(TIER_FLOOR[3]);
  });

  it("ціни зростають із рівнем і більшу суму треба для кращого місця", () => {
    const prices = quote(demoTotals());
    const list = PAID_TIERS.map((tier) => prices[tier as 2]);
    expect(list).toEqual([...list].sort((a, b) => a - b));
    expect(new Set(list).size).toBe(list.length);
    expect(TIER_PX).toEqual([...TIER_PX].sort((a, b) => a - b));
  });

  it("рівень за сумою: нижче 100 ₴ людини на карті немає, межі точні", () => {
    const prices = quote([]);
    expect(tierFor(0, prices)).toBe(1);
    expect(tierFor(99, prices)).toBe(1);
    expect(tierFor(100, prices)).toBe(2);
    expect(tierFor(prices[3] - 1, prices)).toBe(2);
    expect(tierFor(prices[3], prices)).toBe(3);
    expect(tierFor(1_000_000, prices)).toBe(6);
  });

  it("людину перебивають: ті самі гроші дають менший рівень, коли інші платять більше", () => {
    const calm = quote([]);
    const crowded = quote(Array.from({ length: 30 }, (_, index) => 2000 + index * 50));
    expect(tierFor(800, calm)).toBe(4);
    expect(tierFor(800, crowded)).toBeLessThan(4);
  });

  it("скільки докласти до наступного рівня", () => {
    const prices = quote([]);
    expect(toNextTier(0, prices)).toEqual({ tier: 2, extra: 100 });
    expect(toNextTier(250, prices)).toEqual({ tier: 3, extra: prices[3] - 250 });
    expect(toNextTier(10_000, prices)).toBeNull();
  });

  it("позначка «Просування» й вище місце — з першого платного рівня", () => {
    expect(isPromoted(1)).toBe(false);
    expect(isPromoted(2)).toBe(true);
    expect(outrank(3, [{ tier: 1 }, { tier: 2 }, { tier: 3 }, { tier: 5 }])).toBe(2);
  });
});

describe("платежі розміщення на D1", () => {
  let ctx: Awaited<ReturnType<typeof useTestD1>>;
  beforeAll(async () => {
    ctx = await useTestD1();
    for (const id of ["pay-a", "pay-b", "pay-c", "pay-d", ...Array.from({ length: 8 }, (_, index) => `whale-${index}`)]) await makeUser(ctx.db, id);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("сума накопичується, рівень росте, історія — нові першими", async () => {
    const first = await getPlacement("pay-a");
    expect(first).toMatchObject({ total: 0, tier: 1, payments: [] });
    expect(first.prices[2]).toBe(MIN_PAYMENT);
    expect(await addPayment("pay-a", 100)).toMatchObject({ total: 100, tier: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const placement = await addPayment("pay-a", 400);
    expect(placement.total).toBe(500);
    expect(placement.tier).toBeGreaterThanOrEqual(3);
    expect(placement.payments.map((payment) => payment.amount)).toEqual([400, 100]);
  });

  it("у різних людей окремі рахунки, а велика оплата дає найвищий рівень", async () => {
    await addPayment("pay-b", 10_000);
    await addPayment("pay-b", 10_000);
    expect((await getPlacement("pay-b")).tier).toBe(6);
    expect((await getPlacement("pay-c")).tier).toBe(1);
  });

  it("чужа оплата піднімає ціни для інших", async () => {
    const before = (await getPlacement("pay-d")).prices[6];
    for (let index = 0; index < 8; index += 1) {
      await addPayment(`whale-${index}`, 10_000);
      await addPayment(`whale-${index}`, 10_000);
    }
    expect((await getPlacement("pay-d")).prices[6]).toBeGreaterThan(before);
  });

  it("рівні всіх платників для карти збігаються з рівнем окремо", async () => {
    const tiers = await tiersByUser();
    expect(tiers.get("pay-b")).toBe((await getPlacement("pay-b")).tier);
    expect(tiers.has("pay-c")).toBe(false);
  });
});
