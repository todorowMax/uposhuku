// lib/crypto/config.ts
//
// Налаштування мережі для оплат з гаманця (EVM). Чиста розбірка змінних середовища: мережу й адреси задає
// оточення (CRYPTO_CHAIN_ID, CRYPTO_TOKEN_ADDRESS, CRYPTO_ROUTER_ADDRESS, CRYPTO_FACTORY_ADDRESS, CRYPTO_RPC_URL).
// Адресу токена не брати з пам'яті: звіряйте зі сторінкою Tether. Немає потрібної адреси: функція вважається
// вимкненою незалежно від прапорця.

import { getAddress, isAddress, type Address } from "viem";

export interface CryptoRawConfig {
  chainId?: string;
  token?: string;
  router?: string;
  factory?: string;
  rpcUrl?: string;
}

export interface CryptoConfig {
  chainId: number;
  token: Address;
  /** FeeRouter: є, якщо платформа бере комісію з прямого платежу. */
  router: Address | null;
  /** EscrowFactory: без нього ескроу вимкнено. */
  factory: Address | null;
  rpcUrl: string;
}

/** Адреса або null: порожнє й нечинне значення однаково означають «не задано». Нульова адреса не годиться. */
const parseAddress = (raw: string | undefined): Address | null => {
  const value = raw?.trim();
  if (!value || !isAddress(value, { strict: false })) return null;
  const address = getAddress(value.toLowerCase());
  return /^0x0+$/.test(address) ? null : address;
};

/** RPC лише за https; http дозволено тільки для локального вузла (розробка й тести). */
const parseRpcUrl = (raw: string | undefined): string | null => {
  try {
    const url = new URL(raw?.trim() ?? "");
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url.href : null;
  } catch {
    return null;
  }
};

/** Повна конфігурація для оплат з гаманця або null, якщо чогось бракує (тоді функція вимкнена). */
export const parseCryptoConfig = (raw: CryptoRawConfig): CryptoConfig | null => {
  const chainId = Number(raw.chainId?.trim());
  const token = parseAddress(raw.token);
  const rpcUrl = parseRpcUrl(raw.rpcUrl);
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !token || !rpcUrl) return null;
  return { chainId, token, router: parseAddress(raw.router), factory: parseAddress(raw.factory), rpcUrl };
};

/** Що видно браузеру: без RPC (там може бути ключ провайдера). */
export interface PublicCryptoConfig {
  chainId: number;
  token: Address;
  router: Address | null;
  factory: Address | null;
}

export const toPublicConfig = (config: CryptoConfig): PublicCryptoConfig => ({ chainId: config.chainId, token: config.token, router: config.router, factory: config.factory });
