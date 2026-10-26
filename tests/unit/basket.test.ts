import { describe, expect, it } from "vitest";
import { BASKET_PARTS, buildBasket, planPayout, releasedParts, sliceAmount, type BasketItem } from "@/lib/deals/basket";
import { quoteStage, splitShares } from "@/lib/deals/price";

const receivers = { performer: "recv-performer", platform: "recv-platform" };
const total = (items: BasketItem[]) => items.reduce((sum, item) => sum + item.sum, 0);

describe("нарізка суми", () => {
  it("частини рівні з точністю до копійки й дають вхідну суму", () => {
    for (const [amount, parts] of [[10_000, 20], [1_063_830, 20], [999, 7], [20, 20]] as const) {
      const slices = sliceAmount(amount, parts);
      expect(slices).toHaveLength(parts);
      expect(slices.reduce((sum, value) => sum + value, 0)).toBe(amount);
      expect(Math.max(...slices) - Math.min(...slices)).toBeLessThanOrEqual(1);
    }
  });
});

describe("корзина етапу", () => {
  it("сума корзини дорівнює сумі «до оплати», частки збігаються зі сплітом", () => {
    for (const card of ["ua", "foreign"] as const) {
      for (const price of [100, 333, 1999.5, 10_000, 99_999, 100_000]) {
        const payment = quoteStage(price, card);
        const basket = buildBasket(payment, receivers);
        const shares = splitShares(payment);
        expect(basket).toHaveLength(BASKET_PARTS * 2);
        expect(total(basket)).toBe(payment.total);
        expect(total(basket.filter((item) => item.splitReceiverId === receivers.performer))).toBe(shares.performer);
        expect(total(basket.filter((item) => item.splitReceiverId === receivers.platform))).toBe(shares.platform);
      }
    }
  });

  it("позиції мають унікальні коди, qty 1 і додатні суми", () => {
    const basket = buildBasket(quoteStage(10_000, "ua"), receivers);
    expect(new Set(basket.map((item) => item.code)).size).toBe(basket.length);
    expect(basket.every((item) => item.qty === 1 && item.sum >= 1)).toBe(true);
    expect(basket[0].code).toBe("work-1");
    expect(basket[BASKET_PARTS].code).toBe("fee-1");
  });

  it("надто малий етап дає помилку, а не нульову позицію", () => {
    const tiny = { card: "ua" as const, price: 10, fee: 1, bankFee: 1, total: 12 };
    expect(() => buildBasket(tiny, receivers)).toThrow(/надто малий/);
  });
});

describe("план виплати", () => {
  const basket = buildBasket(quoteStage(10_000, "ua"), receivers);

  it("кроку виплати 5%: частка виконавця округлюється до частини", () => {
    expect(releasedParts(0.6)).toBe(12);
    expect(releasedParts(1)).toBe(BASKET_PARTS);
    expect(releasedParts(0)).toBe(0);
    expect(releasedParts(0.02)).toBe(0);
    expect(releasedParts(1.7)).toBe(BASKET_PARTS);
    expect(releasedParts(-1)).toBe(0);
  });

  it("повна виплата йде без корзини на всю суму, нуль частин це повернення", () => {
    expect(planPayout(basket, BASKET_PARTS)).toEqual({ kind: "full", amount: total(basket) });
    expect(planPayout(basket, 0)).toEqual({ kind: "refund" });
  });

  it("часткова виплата бере однакове число частин виконавця й платформи", () => {
    const plan = planPayout(basket, 12);
    if (plan.kind !== "partial") throw new Error("очікували часткову виплату");
    expect(plan.items.filter((item) => item.code.startsWith("work-"))).toHaveLength(12);
    expect(plan.items.filter((item) => item.code.startsWith("fee-"))).toHaveLength(12);
    expect(plan.amount).toBe(total(plan.items));
    expect(plan.amount).toBeLessThan(total(basket));
    // Це точні вихідні позиції: банк інакше відхиляє фіналізацію.
    for (const item of plan.items) expect(basket).toContainEqual(item);
  });
});
