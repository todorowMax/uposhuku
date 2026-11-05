// lib/deals/payout.ts
//
// Заявка виконавця на виплати безпечної угоди: чиста перевірка полів, без бази й шифрування.
// ІПН (РНОКПП) має 10 цифр, остання контрольна: сума перших дев'яти з вагами, mod 11, mod 10.

export const FOP_NAME_MIN = 2;
export const FOP_NAME_MAX = 100;
/** Сторінка оферти, з якою погоджується виконавець. */
export const OFFER_PATH = "/offer/safe-deal";

const WEIGHTS = [-1, 5, 7, 9, 4, 6, 10, 5, 7];

/** ІПН у вигляді для порівняння: лише цифри. */
export const normalizeTaxId = (value: string): string => value.replace(/\D/g, "");

/** Десять цифр і вірна контрольна цифра. */
export const isValidTaxId = (value: string): boolean => {
  const digits = normalizeTaxId(value);
  if (/[^\d\s]/.test(value) || !/^\d{10}$/.test(digits)) return false;
  const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
  return (sum % 11) % 10 === Number(digits[9]);
};

/** Маска ІПН для екрана й списків: перші два і останні дві цифри. */
export const maskTaxId = (value: string): string => {
  const digits = normalizeTaxId(value);
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
};

export interface PayoutApplication {
  fopName: string;
  taxId: string;
}

export type PayoutResult = { ok: true; value: PayoutApplication } | { ok: false; error: string };

/** Перевірка заявки: назва ФОП, ІПН, підтвердження рахунка в mono і згода з офертою. */
export const validatePayoutApplication = (input: unknown): PayoutResult => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const fopName = typeof raw.fopName === "string" ? raw.fopName.trim().replace(/\s+/g, " ") : "";
  const taxId = typeof raw.taxId === "string" ? raw.taxId.trim() : "";
  if (fopName.length < FOP_NAME_MIN || fopName.length > FOP_NAME_MAX) return { ok: false, error: `Назва ФОП: від ${FOP_NAME_MIN} до ${FOP_NAME_MAX} символів.` };
  if (!isValidTaxId(taxId)) return { ok: false, error: "ІПН має містити 10 цифр і збігатися з контрольною цифрою." };
  if (raw.accountConfirmed !== true) return { ok: false, error: "Підтвердьте, що рахунок ФОП відкрито в monobank." };
  if (raw.consent !== true) return { ok: false, error: "Потрібна згода з офертою безпечної угоди." };
  return { ok: true, value: { fopName, taxId: normalizeTaxId(taxId) } };
};
