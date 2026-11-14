// lib/fees/fees.types.ts
//
// Типи комісії за фактом, спільні для чистої логіки, сервера й клієнта. Суми в копійках.

export namespace FeeTypes {
  export type EntryKind = "accrual" | "payment" | "adjustment";

  /** Нарахування за один етап: що саме треба записати в журнал. */
  export interface Accrual {
    dealId: string;
    stageId: string;
    /** База: сума етапу в копійках. */
    baseKop: number;
    rateBp: number;
    /** Скільки нараховуємо, копійки. */
    amountKop: number;
  }

  /** Запис журналу для балансу: потрібна лише сума. */
  export interface Amounted {
    amountKop: number;
  }

  /** Квартал за київським часом. */
  export interface Quarter {
    year: number;
    /** 1..4 */
    quarter: 1 | 2 | 3 | 4;
  }

  /** Рядок рахунку для екрана: запис із короткими даними угоди. */
  export interface EntryView {
    id: string;
    kind: EntryKind;
    amountKop: number;
    /** ISO. */
    createdAt: string;
    dealId: string | null;
    /** «#0BC3», як у картці угоди. */
    dealNumber: string | null;
    stageTitle: string | null;
    baseKop: number | null;
    rateBp: number | null;
    note: string | null;
  }

  export interface Account {
    balanceKop: number;
    /** ISO: до якого моменту сплатити борг поточного кварталу. */
    dueAt: string;
    entries: EntryView[];
  }
}
