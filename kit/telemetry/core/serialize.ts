// kit/telemetry/core/serialize.ts

export const DETAIL_MAX = 4000;
export const DETAIL_MAX_HARD = 12000;

/** Обрізає рядок і порожнє перетворює на null. */
export const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean === "" ? null : clean.slice(0, max);
};

/**
 * Безпечний JSON для подробиць.
 *
 * Циклічні посилання й `Error` звичайний `JSON.stringify` не переживає, а
 * саме вони сюди й приходять. Обрізаємо до межі: стек на сто кадрів не
 * допоміг ще нікому.
 */
export const serialize = (detail: unknown, max = DETAIL_MAX): string | null => {
  if (detail === undefined || detail === null) return null;
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(detail, (_key, value) => {
      if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[циклічне посилання]";
        seen.add(value);
      }
      return value;
    });
    return json ? json.slice(0, Math.min(Math.max(max, DETAIL_MAX), DETAIL_MAX_HARD)) : null;
  } catch {
    return "[не вдалося серіалізувати]";
  }
};
