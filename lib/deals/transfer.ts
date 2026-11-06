// lib/deals/transfer.ts
//
// Тексти картки прямого переказу: призначення платежу й блок реквізитів для копіювання.

import type { BankDetails } from "./requisites";

/** Призначення платежу з номером угоди: за ним виконавець знаходить оплату. */
export const transferPurpose = (dealNumber: string): string => `Оплата за роботу, угода ${dealNumber}`;

/** IBAN групами по 4 символи: так його легше звіряти очима. */
export const groupIban = (iban: string): string => iban.replace(/(.{4})/g, "$1 ").trim();

/** Усі реквізити одним текстом: для кнопки «Копіювати все». */
export const requisitesText = (requisites: BankDetails, amount: number, purpose: string): string =>
  [`Одержувач: ${requisites.recipient}`, `IBAN: ${requisites.iban}`, `Код: ${requisites.taxCode}`, `Сума: ${amount.toFixed(2)} UAH`, `Призначення: ${purpose}`].join("\n");
