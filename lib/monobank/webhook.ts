// lib/monobank/webhook.ts
//
// Перевірка підпису вебхука Monobank: ECDSA P-256 / SHA-256 над сирим тілом
// запиту, підпис у DER (заголовок X-Sign), ключ із /api/merchant/pubkey у base64
// від PEM. Web Crypto замість node:crypto: воркер не має зайвих залежностей.
// Основа з Укошика (lib/monobank/webhook.ts).

import { getMonobankToken, terminalToken, TERMINALS, type Terminal } from "./client";

const PUBKEY_URL = "https://api.monobank.ua/api/merchant/pubkey";

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const pemToDer = (pem: string): Uint8Array => base64ToBytes(pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""));

/** Читач ASN.1 DER: байти й довжини з позицією. Окремо від розбору, щоб розбір лишився простим. */
const derReader = (der: Uint8Array) => {
  let offset = 0;
  const byte = (): number => {
    const value = der[offset];
    offset += 1;
    return value;
  };
  const length = (): number => {
    const first = byte();
    if ((first & 0x80) === 0) return first;
    let result = 0;
    for (let index = 0; index < (first & 0x7f); index += 1) result = (result << 8) | byte();
    return result;
  };
  const integer = (): Uint8Array => {
    if (byte() !== 0x02) throw new Error("Очікувався ASN.1 INTEGER");
    const size = length();
    let bytes = der.slice(offset, offset + size);
    offset += size;
    while (bytes.length > 1 && bytes[0] === 0x00) bytes = bytes.slice(1);
    return bytes;
  };
  return { byte, length, integer };
};

const toFixed32 = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length > 32) throw new Error("Ціле число завелике для P-256");
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
};

/**
 * DER ECDSA-Sig-Value (SEQUENCE { r INTEGER, s INTEGER }) у сирі 64 байти r||s:
 * саме такий підпис приймає Web Crypto. P-256, тож r і s по 32 байти.
 */
export const derSignatureToRaw = (der: Uint8Array): Uint8Array => {
  const reader = derReader(der);
  if (reader.byte() !== 0x30) throw new Error("Очікувався ASN.1 SEQUENCE");
  reader.length();
  const raw = new Uint8Array(64);
  raw.set(toFixed32(reader.integer()), 0);
  raw.set(toFixed32(reader.integer()), 32);
  return raw;
};

/** Ключ живе, доки живе ізоляція воркера. У кожного терміналу свій: ключ одного не перевіряє підпис іншого. Банк радить брати новий, коли перевірка перестає проходити. */
const cachedKeys = new Map<Terminal, CryptoKey>();

/** Експортовано заради тесту: ключ можна зібрати з PEM, згенерованого локально. */
export const importSpkiPem = (pem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("spki", pemToDer(pem) as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);

const fetchPublicKey = async (terminal: Terminal): Promise<CryptoKey> => {
  const response = await fetch(PUBKEY_URL, { headers: { "X-Token": getMonobankToken(terminal) } });
  if (!response.ok) throw new Error(`Не вдалося отримати публічний ключ Monobank: ${response.status}`);
  const { key } = (await response.json()) as { key: string };
  return importSpkiPem(new TextDecoder().decode(base64ToBytes(key)));
};

/** Експортовано заради тесту: перевірка проти ключа, переданого напряму, без запиту до банку. */
export const verifyWithKey = (rawBody: string, xSignBase64: string, key: CryptoKey): Promise<boolean> =>
  crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derSignatureToRaw(base64ToBytes(xSignBase64)) as BufferSource, new TextEncoder().encode(rawBody));

/** Ключ терміналу: з кешу або свіжий з банку. Помилка мережі робить термінал «не підійшов», а не валить перевірку. */
const keyOf = async (terminal: Terminal, fresh: boolean): Promise<CryptoKey | null> => {
  try {
    const cached = fresh ? undefined : cachedKeys.get(terminal);
    if (cached) return cached;
    const key = await fetchPublicKey(terminal);
    cachedKeys.set(terminal, key);
    return key;
  } catch {
    return null;
  }
};

const verifyAcross = async (rawBody: string, xSignBase64: string, fresh: boolean): Promise<boolean> => {
  for (const terminal of TERMINALS) {
    if (!terminalToken(terminal)) continue;
    const key = await keyOf(terminal, fresh);
    if (!key) continue;
    try {
      if (await verifyWithKey(rawBody, xSignBase64, key)) return true;
    } catch {
      // Підпис не розібрався: цей термінал не підійшов.
    }
  }
  return false;
};

/**
 * `rawBody` має бути сирим текстом запиту, а не `JSON.stringify(parsed)`:
 * повторна серіалізація змінює порядок ключів чи пробіли й ламає підпис.
 * Вебхук спільний, тож пробуємо ключі всіх терміналів, для яких є токен: підходить хоч один. Спершу кешовані
 * ключі, і лише коли жоден не підійшов, беремо свіжі (банк радить так робити): справжній вебхук одного
 * терміналу не змушує щоразу оновлювати ключ іншого.
 */
export const verifyWebhookSignature = async (rawBody: string, xSignBase64: string): Promise<boolean> =>
  (await verifyAcross(rawBody, xSignBase64, false)) || (await verifyAcross(rawBody, xSignBase64, true));
