// lib/phone/format.ts
//
// Нормалізація номера до E.164 і маска для показу. Чисті функції без читання середовища.

/** Скільки цифр у номері E.164 (без «+»): від 8 до 15. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/** Український номер: код країни 380 і 9 цифр оператора. */
const UA_CODE = "380";
const UA_NATIONAL = 9;

const onlyAllowed = /^\+?[\d\s().-]+$/;

/**
 * Номер у вигляді E.164 (`+380501234567`) або null. Telegram інколи шле номер без «+». Українські `0501234567`, `380501234567`,
 * `+38 (050) 123-45-67` дають `+380…`; інші країни приймаємо, якщо це схоже на E.164 (8–15 цифр, перша не нуль).
 */
export const normalizePhone = (raw: string): string | null => {
  const text = raw.trim();
  if (!onlyAllowed.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("+") && text.indexOf("+", 1) !== -1) return null;
  const international = text.startsWith("+");
  if (!international && digits.startsWith("00")) digits = digits.slice(2);
  else if (!international && digits.length === UA_NATIONAL + 1 && digits.startsWith("0")) digits = `${UA_CODE}${digits.slice(1)}`;
  if (digits.startsWith(UA_CODE) && digits.length !== UA_CODE.length + UA_NATIONAL) return null;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS || digits.startsWith("0")) return null;
  return `+${digits}`;
};

/** Маска для показу: останні дві цифри видно. `+380501234545` → `+380 •• ••• •• 45`. */
export const maskPhone = (e164: string): string => {
  const digits = e164.replace(/\D/g, "");
  const tail = digits.slice(-2);
  if (digits.startsWith(UA_CODE) && digits.length === UA_CODE.length + UA_NATIONAL) return `+${UA_CODE} •• ••• •• ${tail}`;
  return `+${"•".repeat(Math.max(digits.length - 2, 0))} ${tail}`;
};
