// lib/chat/send-result.ts
//
// Результат відправки повідомлення й чисті правила навколо нього: що лишається в полі після успіху
// і що казати людині, коли сервер відмовив.

export type SendResult = { ok: true } | { ok: false; status: number | null };

/** Код відповіді з помилки `call()` (вона несе `String(status)`); мережевий збій дає null. */
export const statusOfError = (error: unknown): number | null => {
  const status = error instanceof Error ? Number(error.message) : Number.NaN;
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
};

/** Поле після успішної відправки: надіслане знімається з початку, дописане за час запиту лишається. */
export const draftAfterSend = (current: string, submitted: string): string => {
  if (!current.startsWith(submitted)) return current;
  const rest = current.slice(submitted.length);
  return rest.trim() === "" ? "" : rest;
};

export const SEND_ERROR_TEXTS = {
  rateLimit: "Забагато повідомлень за хвилину. Зачекайте й надішліть ще раз.",
  otherSideGone: "Співрозмовник видалив акаунт. Писати йому більше не можна.",
  generic: "Не вдалося надіслати. Текст лишився в полі, спробуйте ще раз.",
} as const;

export const sendErrorText = (status: number | null): string => (status === 429 ? SEND_ERROR_TEXTS.rateLimit : status === 409 ? SEND_ERROR_TEXTS.otherSideGone : SEND_ERROR_TEXTS.generic);
