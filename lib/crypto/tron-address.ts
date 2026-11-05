// lib/crypto/tron-address.ts
//
// Адреси TRON (USDT TRC-20): base58check. Адреса це 34 символи з «T»; у байтах 0x41, 20 байтів адреси й 4 байти
// контрольної суми (подвійний SHA-256). Чисті функції: перевірка, переведення в hex і назад.

import { sha256 } from "./sha256";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PREFIX = 0x41;

/** base58 у байти; null, якщо є чужий символ. */
export const base58Decode = (value: string): Uint8Array | null => {
  let bytes: number[] = [];
  for (const char of value) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) return null;
    for (let index = 0; index < bytes.length; index++) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  bytes = bytes.reverse();
  return Uint8Array.from(bytes);
};

export const base58Encode = (bytes: Uint8Array): string => {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index++) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leading = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    leading += "1";
  }
  return leading + digits.reverse().map((digit) => ALPHABET[digit]).join("");
};

const checksum = (payload: Uint8Array): Uint8Array => sha256(sha256(payload)).slice(0, 4);

/** Адреса TRON у вигляді 20 байтів (hex, малі літери, без префікса 41) або null, якщо адреса некоректна. */
export const tronAddressToHex = (value: string): string | null => {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return null;
  const bytes = base58Decode(value);
  if (!bytes || bytes.length !== 25 || bytes[0] !== PREFIX) return null;
  const payload = bytes.slice(0, 21);
  const sum = checksum(payload);
  if (!sum.every((byte, index) => byte === bytes[21 + index])) return null;
  return [...bytes.slice(1, 21)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const isValidTronAddress = (value: string): boolean => tronAddressToHex(value) !== null;

/** 20 байтів (hex) у адресу TRON. */
export const tronAddressFromHex = (hex20: string): string => {
  const payload = new Uint8Array(21);
  payload[0] = PREFIX;
  for (let index = 0; index < 20; index++) payload[index + 1] = Number.parseInt(hex20.slice(index * 2, index * 2 + 2), 16);
  const full = new Uint8Array(25);
  full.set(payload);
  full.set(checksum(payload), 21);
  return base58Encode(full);
};
