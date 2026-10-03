// lib/server/realtime.ts
//
// Штовхає події в кімнати Durable Object (worker/realtime.ts). Усе «з
// найкращих зусиль»: якщо сокетів немає (локальний `next dev`, збій), API
// працює як працювало, а клієнти доберуть зміни опитуванням.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { RealtimeEvent } from "@/lib/realtime/types";

const send = async (room: string, event: RealtimeEvent) => {
  try {
    const namespace = getCloudflareContext().env.REALTIME;
    if (!namespace) return;
    await namespace.get(namespace.idFromName(room)).fetch("https://realtime/push", { method: "POST", body: JSON.stringify(event) });
  } catch (error) {
    console.warn("realtime push не вдався", error);
  }
};

/** Не затримуємо відповідь API: відправка добігає після неї. */
const later = (work: Promise<void>) => {
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    void work;
  }
};

/** Подія одному користувачу (усі його вкладки). */
export const pushUser = (userId: string | null | undefined, event: RealtimeEvent) => {
  if (userId) later(send(`user:${userId}`, event));
};

/** Публічна подія всім, хто підключений до кімнати global. */
export const pushGlobal = (event: RealtimeEvent) => later(send("global", event));

/** Користувач за id виконавця виду me-<userId>. */
export const userOfPerformer = (performerId: string) => (performerId.startsWith("me-") ? performerId.slice(3) : null);
