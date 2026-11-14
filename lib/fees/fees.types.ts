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

  /** Відповідь GET /api/fees: рахунок із прапорцем, чи комісія взагалі ввімкнена для людини. `dueAt` null, коли нічого немає. */
  export interface Overview {
    enabled: boolean;
    balanceKop: number;
    dueAt: string | null;
    entries: EntryView[];
  }

  /** Відповідь POST /api/fees/invoice: сторінка оплати банку. */
  export interface InvoiceStart {
    id: string;
    pageUrl: string;
  }

  /** Відповідь GET /api/fees/invoices/[id]: статус рахунку в банку й баланс після нього. */
  export interface InvoiceCheck {
    status: string;
    balanceKop: number;
  }

  /** Що казати людині про рахунок: оплачено, не вийшло чи банк ще обробляє. */
  export type InvoiceOutcome = "paid" | "failed" | "pending";
}
