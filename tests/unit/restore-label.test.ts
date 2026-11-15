import { describe, expect, it } from "vitest";
import { canRestore, restoreLeftLabel } from "@/lib/requests/restore";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 14, 12, 0);
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("restoreLeftLabel", () => {
  it("години через Intl: ціла кількість годин, що лишилась, округлена вниз", () => {
    expect(restoreLeftLabel(at(5 * HOUR), NOW)).toBe("можна відновити ще 5 год");
    expect(restoreLeftLabel(at(23 * HOUR + 30 * 60_000), NOW)).toBe("можна відновити ще 23 год");
    expect(restoreLeftLabel(at(HOUR), NOW)).toBe("можна відновити ще 1 год");
  });

  it("вікно протермінованого запиту (7 днів) рахується в днях, а не в сотнях годин", () => {
    expect(restoreLeftLabel(at(6 * 24 * HOUR + 3 * HOUR), NOW)).toBe("можна відновити ще 6 днів");
    expect(restoreLeftLabel(at(47 * HOUR), NOW)).toBe("можна відновити ще 47 год");
  });

  it("менше години: «менше години»", () => {
    expect(restoreLeftLabel(at(HOUR - 1), NOW)).toBe("можна відновити ще менше години");
    expect(restoreLeftLabel(at(1000), NOW)).toBe("можна відновити ще менше години");
  });

  it("час минув, рівно зараз чи нема restoreUntil: null", () => {
    expect(restoreLeftLabel(at(0), NOW)).toBeNull();
    expect(restoreLeftLabel(at(-HOUR), NOW)).toBeNull();
    expect(restoreLeftLabel(null, NOW)).toBeNull();
    expect(restoreLeftLabel("не дата", NOW)).toBeNull();
  });
});

describe("canRestore", () => {
  it("лише закритий запит із майбутнім restoreUntil", () => {
    expect(canRestore({ status: "closed", restoreUntil: at(HOUR) }, NOW)).toBe(true);
    expect(canRestore({ status: "closed", restoreUntil: at(-1) }, NOW)).toBe(false);
    expect(canRestore({ status: "closed", restoreUntil: null }, NOW)).toBe(false);
    expect(canRestore({ status: "open", restoreUntil: null }, NOW)).toBe(false);
    expect(canRestore({ status: "open", restoreUntil: at(HOUR) }, NOW)).toBe(false);
  });
});
