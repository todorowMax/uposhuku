// lib/deals/requisites.ts
//
// Реквізити виконавця для прямого переказу: чиста перевірка й маска, без бази та шифрування.
// Номер картки не приймаємо взагалі: це платіжні дані зі своїми вимогами безпеки, а для переказу
// вистачає IBAN. Посилання на оплату лише https і лише з банківських хостів зі списку.

import { isValidTronAddress } from "@/lib/crypto/tron-address";

export interface Requisites {
  recipient: string;
  iban: string;
  taxCode: string;
  payUrl?: string;
  /** Адреса USDT у мережі TRON (TRC-20). Лише коли ввімкнено прапорець `crypto_proof`. */
  usdtTrc20?: string;
  /** Binance ID (цифри) для переказу всередині Binance. Перевірити оплату на ньому неможливо. */
  binanceId?: string;
  /** Адреса EVM-гаманця для USDT, підтверджена підписом. Ставиться лише сервером після перевірки підпису, з форми не приймається. */
  walletAddress?: string;
}

export type RequisitesResult = { ok: true; value: Requisites } | { ok: false; error: string };

/** Хости, на які дозволено вести посилання на оплату. */
export const PAY_URL_HOSTS: readonly string[] = ["send.monobank.ua", "www.privat24.ua", "next.privat24.ua"];

export const RECIPIENT_MIN = 2;
export const RECIPIENT_MAX = 100;
const PAY_URL_MAX = 500;

export const CARD_REFUSAL = "Номер картки не приймаємо: вкажіть IBAN рахунку (UA…).";

/** IBAN у вигляді для порівняння: без пробілів, великими літерами. */
export const normalizeIban = (value: string): string => value.replace(/[\s-]/g, "").toUpperCase();

/** Контрольна сума IBAN за mod 97 (ISO 13616): переносимо перші 4 символи в кінець, літери стають 10..35. */
const ibanChecksumOk = (iban: string): boolean => {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
};

/** Український IBAN: UA + 27 цифр (29 символів) і вірна контрольна сума. */
export const isValidUaIban = (value: string): boolean => {
  const iban = normalizeIban(value);
  return /^UA\d{27}$/.test(iban) && ibanChecksumOk(iban);
};

/** Перевірка Луна для рядка з цифр. */
export const luhnOk = (digits: string): boolean => {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

/** Схоже на номер банківської картки: 13–19 цифр (з пробілами чи дефісами) і вірний Лун. */
export const looksLikeCardNumber = (value: string): boolean => {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digits) && luhnOk(digits);
};

/** Маска IBAN: перші 4 й останні 4 символи. */
export const maskIban = (value: string): string => {
  const iban = normalizeIban(value);
  return `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
};

/** Код РНОКПП (10 цифр) або ЄДРПОУ (8 цифр). */
export const isValidTaxCode = (value: string): boolean => /^(\d{8}|\d{10})$/.test(value.replace(/\s/g, ""));

/** Посилання на оплату: https, хост зі списку, без логіна й порту. Повертає нормалізоване або null. */
export const normalizePayUrl = (value: string): string | null => {
  if (value.length > PAY_URL_MAX) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return PAY_URL_HOSTS.includes(url.hostname.toLowerCase()) ? url.href : null;
  } catch {
    return null;
  }
};

/** Binance ID: лише цифри, 5–15. */
export const isValidBinanceId = (value: string): boolean => /^\d{5,15}$/.test(value);

/** Ці поля показуються й зберігаються лише там, де ввімкнено крипто-оплату за хешем. */
export const withoutCrypto = (value: Requisites): Requisites => {
  const { usdtTrc20: _usdt, binanceId: _binance, ...rest } = value;
  return rest;
};

/** Підтверджена адреса гаманця показується й зберігається лише там, де ввімкнено оплату з гаманця. */
export const withoutWallet = (value: Requisites): Requisites => {
  const { walletAddress: _wallet, ...rest } = value;
  return rest;
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Перевірити й нормалізувати введення (довільний JSON з тіла запиту). */
export const validateRequisites = (input: unknown): RequisitesResult => {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const recipient = str(raw.recipient).replace(/\s+/g, " ");
  if (recipient.length < RECIPIENT_MIN || recipient.length > RECIPIENT_MAX) return { ok: false, error: `Одержувач: від ${RECIPIENT_MIN} до ${RECIPIENT_MAX} символів.` };
  if (looksLikeCardNumber(recipient)) return { ok: false, error: CARD_REFUSAL };

  const ibanInput = str(raw.iban);
  if (looksLikeCardNumber(ibanInput)) return { ok: false, error: CARD_REFUSAL };
  if (!isValidUaIban(ibanInput)) return { ok: false, error: "IBAN некоректний: потрібен український, 29 символів, UA…" };

  const taxCode = str(raw.taxCode).replace(/\s/g, "");
  if (!isValidTaxCode(taxCode)) return { ok: false, error: "Код РНОКПП (10 цифр) або ЄДРПОУ (8 цифр) вказано невірно." };

  const base: Requisites = { recipient, iban: normalizeIban(ibanInput), taxCode };

  const usdt = str(raw.usdtTrc20);
  if (usdt) {
    if (!isValidTronAddress(usdt)) return { ok: false, error: "Адреса USDT некоректна: потрібна адреса мережі TRON (TRC-20), 34 символи, починається з T." };
    base.usdtTrc20 = usdt;
  }
  const binance = str(raw.binanceId).replace(/\s/g, "");
  if (binance) {
    if (!isValidBinanceId(binance)) return { ok: false, error: "Binance ID: лише цифри, від 5 до 15." };
    base.binanceId = binance;
  }

  const payUrlInput = str(raw.payUrl);
  if (!payUrlInput) return { ok: true, value: base };
  const payUrl = normalizePayUrl(payUrlInput);
  if (!payUrl) return { ok: false, error: `Посилання на оплату: лише https і лише ${PAY_URL_HOSTS.join(", ")}.` };
  return { ok: true, value: { ...base, payUrl } };
};
