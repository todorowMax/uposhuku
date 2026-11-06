// lib/deals/requisites.ts
//
// Реквізити виконавця для прямого переказу: чиста перевірка й маска, без бази та шифрування.
// Номер картки не приймаємо взагалі: це платіжні дані зі своїми вимогами безпеки, а для переказу
// вистачає IBAN. Посилання на оплату лише https і лише з банківських хостів зі списку.

import { isValidTronAddress } from "@/lib/crypto/tron-address";

/**
 * Усі поля необов'язкові: старі записи мали банк завжди, нові можуть мати лише крипту чи зарубіжний сервіс.
 * Банк (одержувач, IBAN, код) або є весь, або його немає: `bankOf` це перевіряє.
 */
export interface Requisites {
  recipient?: string;
  iban?: string;
  taxCode?: string;
  payUrl?: string;
  /** Посилання PayPal.me. Лише коли ввімкнено прапорець `foreign_links`. */
  paypalUrl?: string;
  /** Посилання Wise (pay/me). Лише коли ввімкнено прапорець `foreign_links`. */
  wiseUrl?: string;
  /** Адреса USDT у мережі TRON (TRC-20). Лише коли ввімкнено прапорець `crypto_proof`. */
  usdtTrc20?: string;
  /** Binance ID (цифри) для переказу всередині Binance. Перевірити оплату на ньому неможливо. */
  binanceId?: string;
  /** Адреса EVM-гаманця для USDT, підтверджена підписом. Ставиться лише сервером після перевірки підпису, з форми не приймається. */
  walletAddress?: string;
}

/** Способи, якими виконавець може отримати оплату. Порядок це порядок показу замовнику. */
export const PAYMENT_METHODS = ["bank", "usdt", "wallet", "binance", "paypal", "wise"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank: "Банківський переказ",
  usdt: "USDT TRC-20",
  wallet: "Крипто-гаманець",
  binance: "Binance ID",
  paypal: "PayPal",
  wise: "Wise",
};

export const isPaymentMethod = (value: unknown): value is PaymentMethod => PAYMENT_METHODS.some((method) => method === value);

export interface BankDetails {
  recipient: string;
  iban: string;
  taxCode: string;
  payUrl?: string;
}

/** Банківські реквізити, лише якщо є всі три обов'язкові поля. */
export const bankOf = (value: Requisites): BankDetails | null =>
  value.recipient && value.iban && value.taxCode ? { recipient: value.recipient, iban: value.iban, taxCode: value.taxCode, ...(value.payUrl ? { payUrl: value.payUrl } : {}) } : null;

/** Увімкнені способи за заповненими полями. Нічого не знає про прапорці: їх застосовує `visibleRequisites`. */
export const paymentMethods = (value: Requisites): PaymentMethod[] => {
  const has: Record<PaymentMethod, boolean> = {
    bank: bankOf(value) !== null,
    usdt: Boolean(value.usdtTrc20),
    wallet: Boolean(value.walletAddress),
    binance: Boolean(value.binanceId),
    paypal: Boolean(value.paypalUrl),
    wise: Boolean(value.wiseUrl),
  };
  return PAYMENT_METHODS.filter((method) => has[method]);
};

/** Ключ поля форми, до якого належить помилка (`bank`: група не заповнена повністю). */
export type RequisitesField = "bank" | "recipient" | "iban" | "taxCode" | "payUrl" | "usdtTrc20" | "binanceId" | "paypalUrl" | "wiseUrl";

export type RequisitesFailure = { ok: false; error: string; field?: RequisitesField };
export type RequisitesResult = { ok: true; value: Requisites } | RequisitesFailure;

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

const tail = (value: string) => `•••${value.slice(-4)}`;

/** Маска для списків і листів: IBAN, а без нього коротка мітка першого способу (колонка в базі NOT NULL). */
export const maskOf = (value: Requisites): string => {
  if (value.iban) return maskIban(value.iban);
  if (value.usdtTrc20) return `USDT ${tail(value.usdtTrc20)}`;
  if (value.walletAddress) return `Гаманець ${tail(value.walletAddress)}`;
  if (value.binanceId) return `Binance ${tail(value.binanceId)}`;
  if (value.paypalUrl) return "PayPal";
  if (value.wiseUrl) return "Wise";
  return "—";
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

const NAME = /^[A-Za-z0-9._-]{1,60}$/;

/** Рівно один сегмент імені після префікса шляху (слеш у кінці допустимий). */
const nameAfter = (path: string, prefix: string): string | null => {
  if (!path.startsWith(prefix)) return null;
  const name = path.slice(prefix.length).replace(/\/$/, "");
  return NAME.test(name) ? name : null;
};

/** Посилання на зарубіжний сервіс: лише https, без логіна й порту, точний хост і шлях. Запит і якір відкидаємо. */
const normalizeServiceUrl = (value: string, rules: readonly { host: string; prefix: string }[]): string | null => {
  if (value.length > PAY_URL_MAX) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const rule = rules.find((item) => item.host === url.hostname.toLowerCase());
    const name = rule && nameAfter(url.pathname, rule.prefix);
    return rule && name ? `https://${rule.host}${rule.prefix}${name}` : null;
  } catch {
    return null;
  }
};

/** PayPal: paypal.me/<ім'я> або www.paypal.com/paypalme/<ім'я>. */
export const normalizePaypalUrl = (value: string): string | null =>
  normalizeServiceUrl(value, [
    { host: "paypal.me", prefix: "/" },
    { host: "www.paypal.com", prefix: "/paypalme/" },
  ]);

/** Wise: wise.com/pay/me/<ім'я>. */
export const normalizeWiseUrl = (value: string): string | null => normalizeServiceUrl(value, [{ host: "wise.com", prefix: "/pay/me/" }]);

/** Зарубіжні посилання показуються й зберігаються лише там, де ввімкнено `foreign_links`. */
export const withoutForeign = (value: Requisites): Requisites => {
  const { paypalUrl: _paypal, wiseUrl: _wise, ...rest } = value;
  return rest;
};

export interface MethodAccess {
  crypto: boolean;
  wallet: boolean;
  foreign: boolean;
}

/** Лишає тільки те, що доступно цій людині за прапорцями. */
export const visibleRequisites = (value: Requisites, access: MethodAccess): Requisites => {
  const shown = access.wallet ? value : withoutWallet(value);
  const withCrypto = access.crypto ? shown : withoutCrypto(shown);
  return access.foreign ? withCrypto : withoutForeign(withCrypto);
};

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

const BANK_FIELDS_ERROR = "Банк: заповніть одержувача, IBAN і код разом або вимкніть цей спосіб.";
const NO_METHOD_ERROR = "Оберіть хоча б один спосіб оплати й заповніть його: банк, USDT, Binance ID, PayPal або Wise.";

const cardFieldOf = (recipient: string, iban: string): RequisitesField | null => {
  if (looksLikeCardNumber(recipient)) return "recipient";
  return looksLikeCardNumber(iban) ? "iban" : null;
};

/** Банківська група: все або нічого. Повертає поля або помилку; порожня група це `{}`. */
const validateBank = (raw: Record<string, unknown>): { ok: true; value: Requisites } | RequisitesFailure => {
  const recipient = str(raw.recipient).replace(/\s+/g, " ");
  const ibanInput = str(raw.iban);
  const taxCode = str(raw.taxCode).replace(/\s/g, "");
  const payUrlInput = str(raw.payUrl);
  const cardField = cardFieldOf(recipient, ibanInput);
  if (cardField) return { ok: false, error: CARD_REFUSAL, field: cardField };
  if (!recipient && !ibanInput && !taxCode && !payUrlInput) return { ok: true, value: {} };
  if (!recipient || !ibanInput || !taxCode) return { ok: false, error: BANK_FIELDS_ERROR, field: !recipient ? "recipient" : !ibanInput ? "iban" : "taxCode" };
  if (recipient.length < RECIPIENT_MIN || recipient.length > RECIPIENT_MAX) return { ok: false, error: `Одержувач: від ${RECIPIENT_MIN} до ${RECIPIENT_MAX} символів.`, field: "recipient" };
  if (!isValidUaIban(ibanInput)) return { ok: false, error: "IBAN некоректний: потрібен український, 29 символів, UA…", field: "iban" };
  if (!isValidTaxCode(taxCode)) return { ok: false, error: "Код РНОКПП (10 цифр) або ЄДРПОУ (8 цифр) вказано невірно.", field: "taxCode" };
  const base: Requisites = { recipient, iban: normalizeIban(ibanInput), taxCode };
  if (!payUrlInput) return { ok: true, value: base };
  const payUrl = normalizePayUrl(payUrlInput);
  if (!payUrl) return { ok: false, error: `Посилання на оплату: лише https і лише ${PAY_URL_HOSTS.join(", ")}.`, field: "payUrl" };
  return { ok: true, value: { ...base, payUrl } };
};

/** Крипто-групи: USDT TRC-20 і Binance ID, кожна за бажанням. */
const validateCrypto = (raw: Record<string, unknown>): { ok: true; value: Requisites } | RequisitesFailure => {
  const value: Requisites = {};
  const usdt = str(raw.usdtTrc20);
  if (usdt) {
    if (!isValidTronAddress(usdt)) return { ok: false, error: "Адреса USDT некоректна: потрібна адреса мережі TRON (TRC-20), 34 символи, починається з T.", field: "usdtTrc20" };
    value.usdtTrc20 = usdt;
  }
  const binance = str(raw.binanceId).replace(/\s/g, "");
  if (binance) {
    if (!isValidBinanceId(binance)) return { ok: false, error: "Binance ID: лише цифри, від 5 до 15.", field: "binanceId" };
    value.binanceId = binance;
  }
  return { ok: true, value };
};

/** Зарубіжні посилання PayPal і Wise. */
const validateForeign = (raw: Record<string, unknown>): { ok: true; value: Requisites } | RequisitesFailure => {
  const value: Requisites = {};
  const paypal = str(raw.paypalUrl);
  if (paypal) {
    const url = normalizePaypalUrl(paypal);
    if (!url) return { ok: false, error: "Посилання PayPal: лише https://paypal.me/<ім'я> або https://www.paypal.com/paypalme/<ім'я>.", field: "paypalUrl" };
    value.paypalUrl = url;
  }
  const wise = str(raw.wiseUrl);
  if (wise) {
    const url = normalizeWiseUrl(wise);
    if (!url) return { ok: false, error: "Посилання Wise: лише https://wise.com/pay/me/<ім'я>.", field: "wiseUrl" };
    value.wiseUrl = url;
  }
  return { ok: true, value };
};

/** Перевірити й нормалізувати введення (довільний JSON з тіла запиту). Потрібен хоча б один повний спосіб. */
export const validateRequisites = (input: unknown): RequisitesResult => {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const groups = [validateBank(raw), validateCrypto(raw), validateForeign(raw)];
  const failed = groups.find((group) => !group.ok);
  if (failed && !failed.ok) return failed;
  const value = Object.assign({}, ...groups.map((group) => (group.ok ? group.value : {}))) as Requisites;
  return paymentMethods(value).length > 0 ? { ok: true, value } : { ok: false, error: NO_METHOD_ERROR };
};
