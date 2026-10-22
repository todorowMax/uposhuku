// kit/telemetry/core/fingerprint.ts
//
// Однакові помилки мають збиратися в одну групу, навіть коли в тексті
// різні числа, id чи адреси. Fingerprint = хеш від джерела, коду події,
// «очищеного» повідомлення й першого кадру стека.

import { sha256Hex } from "./hash";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Повідомлення без частин, що змінюються від випадку до випадку. */
export const normalizeMessage = (message: string): string =>
  message
    .toLowerCase()
    // Адреса лишається доменом: шлях і параметри щоразу інші.
    .replace(/https?:\/\/([^\s/'"`]+)[^\s'"`]*/g, "$1")
    .replace(UUID, "#")
    .replace(/\b[0-9a-f]{8,}\b/g, "#")
    .replace(/\d+/g, "0")
    // Текст у лапках — зазвичай значення («невідомий тег "abc"»).
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "'…'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

/** Шлях до файлу без хоста, параметрів і хешу збірки: `/chunks/app/page-3f2a1b9c.js` → `/chunks/app/page.js`. */
const cleanFile = (file: string): string =>
  file
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    .replace(/[?#].*$/, "")
    .replace(/[-.][0-9a-f]{8,}(?=\.[a-z]+$)/i, "")
    .replace(/\/_next\/static\/chunks\//, "/chunks/");

const V8_FRAME = /^at\s+(?:(.*?)\s+\()?([^()]+?):\d+:\d+\)?$/;
const GECKO_FRAME = /^(.*?)@(.+?):\d+:\d+$/;

/** Перший змістовний кадр стека: ім'я функції й чистий файл. */
export const topFrame = (stack: string | null | undefined): string => {
  if (!stack) return "";
  const frames: string[] = [];
  for (const raw of stack.split("\n").slice(0, 15)) {
    const line = raw.trim();
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!match) continue;
    const fn = (match[1] ?? "").trim();
    const file = cleanFile(match[2]);
    if (file) frames.push(`${fn}@${file}`);
  }
  // Кадри бібліотек самі по собі нічого не кажуть: беремо перший не з node_modules.
  return frames.find((frame) => !frame.includes("node_modules")) ?? frames[0] ?? "";
};

export const fingerprint = async (parts: { source: string; event: string; message?: string; stack?: string | null }): Promise<string> =>
  (await sha256Hex([parts.source, parts.event, normalizeMessage(parts.message ?? ""), topFrame(parts.stack)].join("|"))).slice(0, 16);
