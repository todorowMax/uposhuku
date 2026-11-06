// lib/server/presence-repo.ts
//
// Хто зараз онлайн. Пише Durable Object (worker/realtime.ts) через `markPresence`
// (presence-sql.ts); читають API через `onlineUsers`.

import { and, eq, gt } from "drizzle-orm";
import { presence } from "@/db/schema";
import { getDb } from "./db";
import { ONLINE_TTL } from "./presence-sql";

export { ONLINE_TTL, markPresence } from "./presence-sql";

/** Користувачі онлайн зараз. */
export const onlineUsers = async (now = Date.now()): Promise<Set<string>> => {
  const rows = await getDb()
    .select({ userId: presence.userId })
    .from(presence)
    .where(and(eq(presence.online, true), gt(presence.lastSeen, now - ONLINE_TTL)));
  return new Set(rows.map((row) => row.userId));
};

/** Один користувач: запит по `user_id`, без вибірки всіх онлайн. */
export const isOnline = async (userId: string, now = Date.now()): Promise<boolean> => {
  const rows = await getDb()
    .select({ userId: presence.userId })
    .from(presence)
    .where(and(eq(presence.userId, userId), eq(presence.online, true), gt(presence.lastSeen, now - ONLINE_TTL)))
    .limit(1);
  return rows.length > 0;
};
