// lib/deals/parties.ts
//
// Хто є хто в угоді: чисті функції над id виконавця й відгуку.

/** Користувач за id виконавця виду me-<userId>; демо-виконавці (інший id) дають null. */
export const performerUserId = (performerId: string): string | null => (performerId.startsWith("me-") ? performerId.slice(3) : null);

/** id виконавця-акаунта. */
export const performerIdOf = (userId: string): string => `me-${userId}`;

/** Відгук у відповіді сервера має id resp_<requestId>_<userId>: дістаємо автора або null, якщо відгук не з цього запиту. */
export const responseAuthor = (requestId: string, responseId: string): string | null => {
  const prefix = `resp_${requestId}_`;
  return requestId && responseId.startsWith(prefix) && responseId.length > prefix.length ? responseId.slice(prefix.length) : null;
};
