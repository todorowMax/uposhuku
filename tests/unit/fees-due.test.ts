import { describe, expect, it } from "vitest";
import { dueDateOf, type DueEntry } from "@/lib/fees/due";

const at = (iso: string) => Date.parse(iso);
const charge = (iso: string, amountKop: number): DueEntry => ({ amountKop, createdAt: at(iso) });
const pay = (iso: string, amountKop: number): DueEntry => ({ amountKop: -amountKop, createdAt: at(iso) });

describe("dueDateOf: строк від найстарішого неоплаченого нарахування", () => {
  it("боргу немає: null (порожній журнал, усе сплачено, переплата)", () => {
    expect(dueDateOf([])).toBeNull();
    expect(dueDateOf([charge("2026-12-10T10:00:00Z", 50_000), pay("2027-01-05T10:00:00Z", 50_000)])).toBeNull();
    expect(dueDateOf([charge("2026-12-10T10:00:00Z", 50_000), pay("2027-01-05T10:00:00Z", 60_000)])).toBeNull();
  });

  it("нарахування у грудні: строк 14 січня, а не квітня, хоч би яка була дата сьогодні", () => {
    expect(dueDateOf([charge("2026-12-10T10:00:00Z", 50_000)])).toBe("2027-01-14T21:59:59.999Z");
  });

  it("оплати гасять найстаріші нарахування першими: часткова оплата зсуває строк на наступне нарахування", () => {
    const entries = [charge("2026-06-10T10:00:00Z", 30_000), charge("2026-12-10T10:00:00Z", 50_000), pay("2026-07-01T10:00:00Z", 30_000)];
    // Червневе покрите повністю, лишається грудневе.
    expect(dueDateOf(entries)).toBe("2027-01-14T21:59:59.999Z");
    // Оплата менша за червневе: червневе лишається найстаршим неоплаченим (II квартал + 14 днів).
    expect(dueDateOf([entries[0], entries[1], pay("2026-07-01T10:00:00Z", 10_000)])).toBe("2026-07-14T20:59:59.999Z");
  });

  it("порядок записів у списку не важливий, мінусове коригування діє як оплата", () => {
    const entries: DueEntry[] = [charge("2026-12-10T10:00:00Z", 50_000), charge("2026-03-10T10:00:00Z", 20_000), { amountKop: -20_000, createdAt: at("2026-04-01T10:00:00Z") }];
    expect(dueDateOf(entries)).toBe("2027-01-14T21:59:59.999Z");
    expect(dueDateOf([...entries].reverse())).toBe("2027-01-14T21:59:59.999Z");
  });
});
