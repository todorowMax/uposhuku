// lib/crypto/approvals.ts
//
// Які схвалення токена потрібні перед платежем. Схвалюємо лише точну суму, ніколи не безмежно. USDT в Ethereum
// не дозволяє міняти ненульове схвалення на інше ненульове: якщо поточне не нуль і менше потрібного, спершу
// скидаємо до нуля.

/** Послідовність викликів approve (суми в мінімальних одиницях): порожня, коли поточного схвалення вистачає. */
export const approvalSteps = (current: bigint, needed: bigint): bigint[] => {
  if (needed <= 0n || current >= needed) return [];
  return current === 0n ? [needed] : [0n, needed];
};
