// kit/telemetry/next/request.ts
//
// Общие мелочи обох роутів: IP, країна й безпечне читання тіла.

/** IP для лімітів: за Cloudflare це cf-connecting-ip. */
export const clientIp = (request: Request): string =>
  request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

export const countryOf = (request: Request): string | null => {
  const value = request.headers.get("cf-ipcountry");
  // XX — невідомо, T1 — Tor: країни в цьому немає.
  return value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : null;
};

export type BodyResult = { ok: true; body: Record<string, unknown> } | { ok: false; reason: "too_large" | "invalid" };

/**
 * Тіло як об'єкт. Понад `maxBytes` не читаємо взагалі, якщо клієнт чесно
 * вказав довжину, а якщо ні, перевіряємо після читання.
 */
export const readBody = async (request: Request, maxBytes: number): Promise<BodyResult> => {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (text.length > maxBytes) return { ok: false, reason: "too_large" };
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ok: true, body: parsed as Record<string, unknown> } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
};
