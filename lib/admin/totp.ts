// lib/admin/totp.ts
//
// Одноразові коди TOTP (RFC 6238: HMAC-SHA1, крок 30 с, 6 цифр) на WebCrypto. Секрет у base32, як у застосунках-
// автентифікаторах. «Зараз» приходить параметром. Перевірка приймає сусідні кроки (±1) на розбіжність годинників.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648) у байти; пробіли й `=` ігноруємо. null, якщо є чужий символ. */
export const decodeBase32 = (value: string): Uint8Array<ArrayBuffer> | null => {
  const clean = value.toUpperCase().replace(/[\s=]/g, "");
  if (!clean) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
};

/** Код для кроку counter. */
export const totpCode = async (secret: Uint8Array<ArrayBuffer>, counter: number): Promise<string> => {
  const message = new ArrayBuffer(8);
  new DataView(message).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
};

const sameText = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return diff === 0;
};

/** Чи вірний код у цей момент (поточний крок і по одному сусідньому). */
export const verifyTotp = async (input: { secret: string; code: unknown; now: number }): Promise<boolean> => {
  const key = decodeBase32(input.secret);
  const code = typeof input.code === "string" ? input.code.replace(/\s/g, "") : "";
  if (!key || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(input.now / 1000 / STEP_SECONDS);
  let ok = false;
  for (const shift of [-1, 0, 1]) ok = sameText(await totpCode(key, counter + shift), code) || ok;
  return ok;
};
