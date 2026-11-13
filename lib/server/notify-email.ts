// lib/server/notify-email.ts
//
// Сповіщення листом (другий канал диспетчера, lib/server/notify.ts). Питає по черзі: лист у цього випадку є? пошта
// працює? людина цього хоче? її зараз немає на сайті? пошта жива? не частіше разу на 30 хвилин на вид? Хоч на одне
// «ні», і мовчимо. Притримані події лічимо в `notification_log` і в наступному листі пишемо «ще N нових».
// Нічого не кидає: збій листа не має ламати ні відповідь API, ні Telegram.

import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { notificationLog, users } from "@/db/schema";
import type { EmailEvent, Notice } from "@/lib/telegram/notices";
import { logServer } from "@/lib/telemetry/log";
import { getDb } from "./db";
import { siteUrl } from "./env";
import { mailMode, sendNoticeMail } from "./mail";
import { getPrefs } from "./notification-prefs-repo";
import { isOnline } from "./presence-repo";
import { signUnsubscribeToken } from "./unsubscribe-token";

/** Не частіше одного листа на людину й вид (повідомлення, відгук, угода) за цей час. */
export const EMAIL_WINDOW_MS = 30 * 60 * 1000;

export type EmailOutcome = "sent" | "disabled" | "no_email" | "off" | "online" | "no_address" | "duplicate" | "held" | "failed";

interface Recipient {
  email: string;
  event: EmailEvent;
  token: string;
}

/** Хто й що: адреса, подія й токен відписки. Відмова повертається як підсумок. */
const recipientOf = async (userId: string, notice: Notice, now: number): Promise<Recipient | EmailOutcome> => {
  const event = notice.email;
  if (!event) return "no_email";
  if (mailMode() === "off") return "disabled";
  const prefs = await getPrefs(userId);
  if (!prefs.channels.email || !prefs.kinds[notice.kind]) return "off";
  if (await isOnline(userId, now)) return "online";
  const [user] = await getDb().select({ email: users.email, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.deletedAt !== null) return "no_address";
  const token = await signUnsubscribeToken(userId);
  return token ? { email: user.email, event, token } : "disabled";
};

/** Ключі, які тримає цей лист у журналі: щоб звільнити їх, якщо відправка не вдалася. */
interface Claim {
  keys: string[];
  /** Час попереднього листа цього виду, від нього рахуємо притримані. */
  lastAt: number;
}

/**
 * Займає місце під лист до відправки: дві одночасні події не пошлють два листи. Вікно рахується від попереднього листа,
 * а ключ із номером півгодинки ловить гонку паралельних викликів. Інакше «held» (притримано) чи «duplicate» (така подія вже була).
 */
const claimSlot = async ({ userId, notice, event, now }: { userId: string; notice: Notice; event: EmailEvent; now: number }): Promise<Claim | "duplicate" | "held"> => {
  const db = getDb();
  const insert = (key: string, kind: string) => db.insert(notificationLog).values({ key, userId, kind, createdAt: now }).onConflictDoNothing().returning({ key: notificationLog.key });
  // Угоду можуть оголосити двічі (повтор вебхука): той самий випадок листом не повторюємо.
  const eventKey = event.type === "deal" ? `email_event:${notice.key}` : null;
  if (eventKey && (await insert(eventKey, "email_event")).length === 0) return "duplicate";

  const sentKind = `email:${event.type}`;
  const [last] = await db
    .select({ at: notificationLog.createdAt })
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), eq(notificationLog.kind, sentKind)))
    .orderBy(desc(notificationLog.createdAt))
    .limit(1);
  const windowKey = `${sentKind}:${userId}:${Math.floor(now / EMAIL_WINDOW_MS)}`;
  const tooSoon = last !== undefined && now - last.at < EMAIL_WINDOW_MS;
  if (!tooSoon && (await insert(windowKey, sentKind)).length > 0) return { keys: eventKey ? [windowKey, eventKey] : [windowKey], lastAt: last?.at ?? 0 };
  await insert(`email_held:${event.type}:${userId}:${now}:${crypto.randomUUID()}`, `email_held:${event.type}`);
  return "held";
};

const heldSince = async (userId: string, event: EmailEvent, since: number): Promise<number> => {
  const [pending] = await getDb()
    .select({ total: count() })
    .from(notificationLog)
    .where(and(eq(notificationLog.userId, userId), eq(notificationLog.kind, `email_held:${event.type}`), gt(notificationLog.createdAt, since)));
  return pending?.total ?? 0;
};

export const notifyEmail = async (userId: string, notice: Notice, now = Date.now()): Promise<EmailOutcome> => {
  try {
    const who = await recipientOf(userId, notice, now);
    if (typeof who === "string") return who;
    const claim = await claimSlot({ userId, notice, event: who.event, now });
    if (typeof claim === "string") return claim;
    try {
      const held = await heldSince(userId, who.event, claim.lastAt);
      await sendNoticeMail(who.email, { event: who.event, held, siteUrl: siteUrl(), unsubscribeUrl: `${siteUrl()}/api/notifications/unsubscribe?token=${who.token}` });
      return "sent";
    } catch (error) {
      // Не вдалося: ключі звільняємо, щоб наступна подія могла спробувати знову.
      await getDb().delete(notificationLog).where(inArray(notificationLog.key, claim.keys));
      logServer({ level: "error", event: "email_notice_failed", message: error instanceof Error ? error.message : String(error), detail: { type: who.event.type } });
      return "failed";
    }
  } catch (error) {
    logServer({ level: "error", event: "notify_email_failed", message: error instanceof Error ? error.message : String(error), detail: { stack: error instanceof Error ? error.stack : null } });
    return "failed";
  }
};
