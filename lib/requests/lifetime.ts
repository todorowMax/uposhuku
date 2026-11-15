// lib/requests/lifetime.ts
//
// Строк життя запиту: через 14 днів автору ставимо питання «Ще актуально?», без відповіді за 3 дні запит закривається
// з причиною «протермінований», і автор може відкрити його знову протягом 7 днів. Чисті функції: час передає той, хто викликає (ARCH-10).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Скільки запит живе від публікації (або від останнього «Ще актуально») до питання автору. */
export const RENEW_AFTER_MS = 14 * DAY_MS;
/** Скільки автор має на відповідь, перш ніж запит закриється сам. */
export const RENEW_ANSWER_MS = 3 * DAY_MS;
/** Скільки після автоматичного закриття запит можна відновити (після закриття самим автором: `RESTORE_WINDOW_MS`, доба). */
export const EXPIRED_RESTORE_WINDOW_MS = 7 * DAY_MS;

export type CloseReason = "expired";

interface LifetimeRow {
  createdAt: number;
  renewedAt: number | null;
}

/** З якого моменту рахуємо 14 днів: останнє «Ще актуально» або публікація. */
export const lifetimeStart = (row: LifetimeRow): number => row.renewedAt ?? row.createdAt;

/** Коли автору час поставити питання. */
export const renewalDueAt = (row: LifetimeRow): number => lifetimeStart(row) + RENEW_AFTER_MS;

/** Кінець строку відповіді (ms) для запиту, якому питання вже поставлено; null, якщо не питали. */
export const answerDeadline = (renewalAskedAt: number | null): number | null => (renewalAskedAt === null ? null : renewalAskedAt + RENEW_ANSWER_MS);

/** Скільки триває вікно відновлення закритого запиту залежно від причини закриття. */
export const restoreWindowMs = (reason: CloseReason | null, normalMs: number): number => (reason === "expired" ? EXPIRED_RESTORE_WINDOW_MS : normalMs);
