import { describe, expect, it } from "vitest";
import type { FeeTypes } from "@/lib/fees/fees.types";
import { debtKop, dueText, entryFormula, entryTitle, formFeeAmount, formFeeKop, invoiceOutcome, kindLabel, rateText, showFeesItem, signedKop } from "@/lib/fees/view";

/** Пробіли в Intl бувають нерозривні: порівнюємо звичайними. */
const plain = (text: string | null) => text?.replace(/\s/g, " ") ?? null;

const entry = (patch: Partial<FeeTypes.EntryView>): FeeTypes.EntryView => ({
  id: "fee_1",
  kind: "accrual",
  amountKop: 110_000,
  createdAt: "2026-11-14T10:00:00.000Z",
  dealId: "deal_1",
  dealNumber: "#0BC3",
  stageTitle: "Дизайн",
  baseKop: 2_200_000,
  rateBp: 500,
  note: null,
  ...patch,
});

describe("lib/fees/view", () => {
  it("ставка словами", () => {
    expect(rateText(500)).toBe("5%");
  });

  it("строк без «р.»", () => {
    expect(dueText("2027-04-14T09:00:00.000Z")).toBe("14 квітня 2027");
  });

  it("борг не буває від'ємним", () => {
    expect(debtKop(-500)).toBe(0);
    expect(debtKop(110_000)).toBe(110_000);
  });

  it("сума зі знаком: плюс для нарахування, мінус для оплати", () => {
    expect(plain(signedKop(110_000))).toBe("+1 100 ₴");
    expect(plain(signedKop(-110_050))).toBe("−1 100,50 ₴");
  });

  it("слово запису", () => {
    expect([kindLabel("accrual"), kindLabel("payment"), kindLabel("adjustment")]).toEqual(["Нараховано", "Сплачено", "Коригування"]);
  });

  it("підпис запису: угода й етап, оплата, примітка", () => {
    expect(entryTitle(entry({}))).toBe("Угода #0BC3 · етап «Дизайн»");
    expect(entryTitle(entry({ stageTitle: null }))).toBe("Угода #0BC3");
    expect(entryTitle(entry({ kind: "payment", dealId: null, dealNumber: null }))).toBe("Оплата комісії");
    expect(entryTitle(entry({ kind: "adjustment", dealNumber: null, note: "Помилкове натискання" }))).toBe("Помилкове натискання");
  });

  it("розрахунок «22 000 ₴ × 5%», а без бази нічого", () => {
    expect(plain(entryFormula(entry({})))).toBe("22 000 ₴ × 5%");
    expect(entryFormula(entry({ baseKop: null }))).toBeNull();
  });

  it("пункт меню видно за прапорцем, записами чи боргом", () => {
    const base: FeeTypes.Overview = { enabled: false, balanceKop: 0, dueAt: null, entries: [] };
    expect(showFeesItem(null)).toBe(false);
    expect(showFeesItem(base)).toBe(false);
    expect(showFeesItem({ ...base, enabled: true })).toBe(true);
    expect(showFeesItem({ ...base, entries: [entry({})] })).toBe(true);
    expect(showFeesItem({ ...base, balanceKop: 100 })).toBe(true);
  });

  it("статус рахунку: оплачено, відмова, ще обробляється", () => {
    expect(invoiceOutcome("success")).toBe("paid");
    expect(["failure", "expired", "reversed"].map(invoiceOutcome)).toEqual(["failed", "failed", "failed"]);
    expect(["created", "processing", "hold"].map(invoiceOutcome)).toEqual(["pending", "pending", "pending"]);
  });

  it("комісія для форми: 5% від суми угоди", () => {
    expect(formFeeKop(22_000)).toBe(110_000);
    expect(plain(formFeeAmount(22_000))).toBe("1 100 ₴");
    expect(formFeeKop(0)).toBe(0);
  });
});
