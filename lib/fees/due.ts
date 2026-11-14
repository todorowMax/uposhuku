// lib/fees/due.ts
//
// Строк оплати комісії від найстарішого неоплаченого нарахування. Оплати гасять найстаріші нарахування першими (FIFO),
// строк це кінець кварталу, в якому зроблено перше нарахування, що лишилось не покритим, плюс 14 днів (lib/fees/period.ts).
// Чиста функція: нічого не читає, «зараз» не потрібне.

import type { FeeTypes } from "./fees.types";
import { dueDateFor } from "./period";

/** Запис журналу для строку: сума зі знаком і час запису (мс). */
export interface DueEntry extends FeeTypes.Amounted {
  createdAt: number;
}

/**
 * ISO строку або null, коли боргу немає. Нарахування (додатні суми) йдуть за часом; усе від'ємне (оплати, мінусові
 * коригування) разом спрямовується на найстаріші з них. Додатне коригування рахується нарахуванням на свій час.
 */
export const dueDateOf = (entries: readonly DueEntry[]): string | null => {
  let credit = entries.reduce((sum, entry) => (entry.amountKop < 0 ? sum - entry.amountKop : sum), 0);
  const charges = entries.filter((entry) => entry.amountKop > 0).sort((a, b) => a.createdAt - b.createdAt);
  for (const charge of charges) {
    if (credit < charge.amountKop) return dueDateFor(charge.createdAt);
    credit -= charge.amountKop;
  }
  return null;
};
