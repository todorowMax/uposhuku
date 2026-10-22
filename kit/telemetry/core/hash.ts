// kit/telemetry/core/hash.ts

/** SHA-256 у hex. WebCrypto є і у воркері, і в Node, і в браузері. */
export const sha256Hex = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Короткий хеш IP з сіллю: для лімітів, самого IP не зберігаємо. */
export const hashIp = async (ip: string, salt: string): Promise<string> => (await sha256Hex(`${ip}|${salt}`)).slice(0, 16);
