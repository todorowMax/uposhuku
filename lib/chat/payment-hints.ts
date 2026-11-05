// lib/chat/payment-hints.ts
//
// Платіжні дані в тексті чату: номер картки, український IBAN, адреса TRON чи EVM. Повідомлення не блокуємо
// і на сервер ознаку не відправляємо: показуємо лише підказку перевіряти реквізити в картці угоди.

import { luhnOk } from "@/lib/deals/requisites";

export const PAYMENT_HINT = "Реквізити для оплати перевіряйте в картці угоди.";

/** 13–19 цифр підряд (з пробілами чи дефісами між ними) і вірна контрольна сума Луна. */
const hasCardNumber = (text: string): boolean =>
  (text.match(/\d(?:[ -]?\d){12,18}/g) ?? []).some((run) => luhnOk(run.replace(/[ -]/g, "")));

const UA_IBAN = /(?<![A-Za-z0-9])UA(?:[ -]?\d){27}(?!\d)/i;
const TRON_ADDRESS = /(?<![A-Za-z0-9])T[1-9A-HJ-NP-Za-km-z]{33}(?![A-Za-z0-9])/;
const EVM_ADDRESS = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/;

export const mentionsPaymentDetails = (text: string): boolean =>
  hasCardNumber(text) || UA_IBAN.test(text) || TRON_ADDRESS.test(text) || EVM_ADDRESS.test(text);
