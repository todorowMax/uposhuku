import { describe, expect, it } from "vitest";
import { feeLabel } from "@/lib/crypto/fee-label";
import { RISK_ITEMS } from "@/lib/legal/risk-items";

describe("рядок комісії ескроу", () => {
  it("нуль це «Комісія: немає», а не «0%»", () => {
    expect(feeLabel(0)).toBe("Комісія: немає");
    expect(feeLabel(0)).not.toContain("%");
  });
  it("ненульова ставка читається з контракту у відсотках, до відповіді пишемо, що читаємо", () => {
    expect(feeLabel(500)).toBe("Комісія, 5%");
    expect(feeLabel(750)).toBe("Комісія, 7.5%");
    expect(feeLabel(null)).toContain("читаємо");
  });
});

describe("попередження про ризики крипти", () => {
  it("8–10 пунктів, кожен із заголовком і текстом", () => {
    expect(RISK_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(RISK_ITEMS.length).toBeLessThanOrEqual(10);
    for (const item of RISK_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.text.length).toBeGreaterThan(20);
    }
  });
});
