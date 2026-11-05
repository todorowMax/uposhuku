// lib/server/secret-box.ts
//
// Шифрування чутливих полів (реквізити виконавця) AES-256-GCM на WebCrypto. Ключ REQUISITES_KEY
// (base64, 32 байти) лежить лише в секретах. Кожне повідомлення має власний випадковий IV, а
// `aad` (id власника) прив'язує шифротекст до людини: чужий aad його не розшифрує.
// Формат: `<версія ключа>.<iv base64>.<шифротекст base64>`; версія дозволяє змінити ключ згодом.

import { readVar } from "./env";

/** Ключа немає або він зіпсований: зберігати й читати реквізити не можна (маршрути відповідають 503). */
export class SecretBoxUnavailableError extends Error {}

const KEY_VERSION = "1";
const IV_BYTES = 12;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const importKey = async (version: string): Promise<CryptoKey> => {
  // Єдина версія ключа поки одна; нова версія додасться ще однією змінною.
  const raw = version === KEY_VERSION ? readVar("REQUISITES_KEY") : undefined;
  if (!raw) throw new SecretBoxUnavailableError("Ключ шифрування реквізитів не задано");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(raw);
  } catch {
    throw new SecretBoxUnavailableError("Ключ шифрування реквізитів не base64");
  }
  if (bytes.length !== 32) throw new SecretBoxUnavailableError("Ключ шифрування реквізитів має бути 32 байти");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const aadBytes = (aad: string) => new TextEncoder().encode(aad);

/** Зашифрувати текст для власника `aad`. */
export const sealText = async (plain: string, aad: string): Promise<string> => {
  const key = await importKey(KEY_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadBytes(aad) }, key, new TextEncoder().encode(plain));
  return `${KEY_VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
};

/** Розшифрувати; кидає помилку, якщо `aad` чужий або дані пошкоджено. */
export const openText = async (sealed: string, aad: string): Promise<string> => {
  const [version, iv, cipher] = sealed.split(".");
  if (!version || !iv || !cipher) throw new Error("Невірний формат шифротексту");
  const key = await importKey(version);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: aadBytes(aad) }, key, fromBase64(cipher));
  return new TextDecoder().decode(plain);
};
