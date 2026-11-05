// lib/deals/limits.ts
//
// Обмеження безпечної угоди, що захищають гроші: новий акаунт платить лише малі етапи, велике приймання
// підтверджується кодом з пошти. Чисті функції: «зараз» приходить параметром.

const DAY = 86_400_000;

/** Акаунт молодший за цей вік вважається новим. */
export const NEW_ACCOUNT_DAYS = 7;
/** Найбільший етап для нового акаунта, ₴ (ціна виконавця). */
export const NEW_ACCOUNT_MAX_STAGE = 5_000;
/** Від цієї ціни етапу приймання роботи замовником потребує коду з пошти, ₴. */
export const RELEASE_CODE_FROM = 10_000;

/** Текст відмови, якщо новий акаунт хоче оплатити завеликий етап; null, якщо можна. */
export const newAccountLimit = (input: { createdAt: number; amount: number; now: number }): string | null => {
  const { createdAt, amount, now } = input;
  if (now - createdAt >= NEW_ACCOUNT_DAYS * DAY || amount <= NEW_ACCOUNT_MAX_STAGE) return null;
  return `Поки акаунту менше ${NEW_ACCOUNT_DAYS} днів, етап безпечної угоди не може бути більшим за ${NEW_ACCOUNT_MAX_STAGE.toLocaleString("uk-UA")} ₴. Розділіть його на менші або зачекайте.`;
};

/** Чи потрібен код з пошти, щоб прийняти етап із такою ціною. */
export const releaseNeedsCode = (amount: number): boolean => amount >= RELEASE_CODE_FROM;
