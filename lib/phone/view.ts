// lib/phone/view.ts
//
// Чисті рішення клієнта про телефон: який вигляд має шторка, що писати в меню акаунта. Без читання стану браузера.

export namespace PhoneViewTypes {
  /** Стан шторки: `idle` кнопка «Відкрити Telegram», `starting` запит до сервера, `waiting` чекаємо бота, `verified` готово, `error` відмова. */
  export type SheetState = "idle" | "starting" | "waiting" | "verified" | "error";
  export type SheetInput = { verified: boolean; starting: boolean; started: boolean; error: string | null };
  export type MenuInput = { required: boolean; verified: boolean };
}

/** Інтервал запасного опитування, поки відкрита шторка очікування (мс). */
export const PHONE_POLL_MS = 3000;

/** Вигляд шторки: підтверджений номер перемагає все, далі помилка, запит, очікування. */
export const phoneSheetState = ({ verified, starting, started, error }: PhoneViewTypes.SheetInput): PhoneViewTypes.SheetState => {
  if (verified) return "verified";
  if (error) return "error";
  if (starting) return "starting";
  return started ? "waiting" : "idle";
};

/** Пункт меню «Телефон» видно, коли номер потрібен або вже підтверджений. */
export const showPhoneItem = ({ required, verified }: PhoneViewTypes.MenuInput): boolean => required || verified;

/** Підпис справа в меню. */
export const phoneMenuNote = ({ verified }: Pick<PhoneViewTypes.MenuInput, "verified">): string => (verified ? "підтверджено" : "не підтверджено");

/** Опитування потрібне лише в очікуванні відповіді бота. */
export const shouldPoll = (open: boolean, state: PhoneViewTypes.SheetState): boolean => open && state === "waiting";
