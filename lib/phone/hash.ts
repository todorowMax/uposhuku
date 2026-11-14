// lib/phone/hash.ts
//
// HMAC-SHA256 номера в E.164 із секретним ключем (PHONE_HASH_KEY), hex. Web Crypto: працює у воркері й у Node.
// Без ключа хеш не рахуємо: «порожній» ключ дав би хеш, який можна підібрати перебором усіх номерів.

export const phoneHash = async (e164: string, key: string): Promise<string> => {
  if (!key) throw new Error("PHONE_HASH_KEY порожній");
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(e164));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
