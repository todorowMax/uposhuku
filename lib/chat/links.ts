// lib/chat/links.ts
//
// Посилання в тексті повідомлення. Текст ріжемо на звичайні шматки й посилання; рендер малює шматки елементами,
// без `dangerouslySetInnerHTML`. Посиланням стає лише `http:` чи `https:` (а також `www.…`, його адреса починається
// з `https://`): `javascript:`, `data:` та інші схеми цей розбір не пропускає.

export type TextPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

/** Початок посилання й усе до пробілу чи кутової дужки. */
const CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>]+/giu;
/** Розділові знаки, що завершують речення, а не адресу. */
const TRAILING = /[.,;:!?'"»”’…]$/u;
const CLOSING: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

const count = (text: string, char: string): number => text.split(char).length - 1;

/** Відкидає з кінця кандидата розділові знаки й дужку-закривачку без пари (дужка в адресі Вікіпедії лишається). */
const trimTrailing = (candidate: string): string => {
  let end = candidate;
  for (;;) {
    const last = end.at(-1) ?? "";
    const opener = CLOSING[last];
    if (TRAILING.test(end) || (opener && count(end, last) > count(end, opener))) end = end.slice(0, -1);
    else return end;
  }
};

/** Адреса для `href` або null, якщо це не придатне веб-посилання. */
const hrefOf = (text: string): string | null => {
  try {
    const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // `https://bank.com@evil.test` читається як bank.com, а веде на інший сайт: такі не клікаємо.
    if (url.username || url.password) return null;
    if (!url.hostname || url.hostname.split(".").some((label) => !label)) return null;
    return url.href;
  } catch {
    return null;
  }
};

/** Чи попередній символ робить початок кандидата частиною слова (`xhttps://…`). */
const insideWord = (text: string, index: number): boolean => index > 0 && /[\p{L}\p{N}_]/u.test(text[index - 1]);

export const splitLinks = (text: string): TextPart[] => {
  const parts: TextPart[] = [];
  let cursor = 0;
  const pushText = (end: number) => {
    if (end > cursor) parts.push({ type: "text", text: text.slice(cursor, end) });
  };
  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index;
    if (start < cursor || insideWord(text, start)) continue;
    const shown = trimTrailing(match[0]);
    const href = hrefOf(shown);
    if (!href) continue;
    pushText(start);
    parts.push({ type: "link", text: shown, href });
    cursor = start + shown.length;
  }
  pushText(text.length);
  return parts;
};
