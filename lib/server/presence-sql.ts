// lib/server/presence-sql.ts
//
// Запис присутності з голим D1, без залежностей від Next: його імпортує і
// Durable Object (worker/realtime.ts), де контексту застосунку немає.

/** Скільки мс без пульсу вважаємо людину ще онлайн: пульс раз на хвилину, запас на мережу. */
export const ONLINE_TTL = 150_000;

export const markPresence = async (db: D1Database, userId: string, online: boolean, now = Date.now()) => {
  await db
    .prepare("insert into presence (user_id, online, last_seen) values (?, ?, ?) on conflict (user_id) do update set online = excluded.online, last_seen = excluded.last_seen")
    .bind(userId, online ? 1 : 0, now)
    .run();
};

/** Не частіше одного пульсу на 20 с з сокета; решту відкидаємо до звернення до D1. */
export const BEAT_MIN_GAP = 20_000;

export const beatAllowed = (last: number | undefined, now: number): boolean => last === undefined || now - last >= BEAT_MIN_GAP;
