// lib/server/notify.ts
//
// Сповіщення в Telegram. Диспетчер питає по черзі: бот увімкнений? людина
// прив'язана? вона цього хоче? вона зараз не на сайті? не повторюємо ми те
// саме? Хоч на одне «ні», і мовчимо. Нічого не кидає й не затримує відповідь
// API: усе добігає після неї.

import { and, count, eq, gt } from "drizzle-orm";
import { notificationLog } from "@/db/schema";
import { sendMessage, TelegramError } from "@/lib/telegram/api";
import { telegramConfig } from "@/lib/telegram/config";
import type { Notice } from "@/lib/telegram/notices";
import { logServer } from "@/lib/telemetry/log";
import { telemetryConfig } from "@/lib/telemetry/server";
import { getDb } from "./db";
import { getPrefs } from "./notification-prefs-repo";
import { isOnline } from "./presence-repo";
import { activeLink, deactivateByChat } from "./telegram-repo";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Запитів під теги не більше цього на людину за добу. */
export const MATCHING_DAILY_LIMIT = 10;
/** Види, які не шлемо, поки людина на сайті: вона й так бачить їх на екрані. */
const SKIP_WHEN_ONLINE = new Set(["offers", "messages"]);

export type NotifyOutcome = "sent" | "disabled" | "no_link" | "off" | "online" | "duplicate" | "limit" | "failed";

/** Київська година 0–23: тихі години за Києвом, а не за часом сервера. */
export const kyivHour = (now: number): number => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "numeric", hourCycle: "h23" }).format(now));

/** З 23:00 до 08:00. */
export const isQuietHour = (now: number): boolean => {
  const hour = kyivHour(now);
  return hour >= 23 || hour < 8;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const notifyUser = async (userId: string, notice: Notice, now = Date.now()): Promise<NotifyOutcome> => {
  try {
    const config = telegramConfig();
    if (!config.enabled) return "disabled";
    const link = await activeLink(userId);
    if (!link) return "no_link";
    const prefs = await getPrefs(userId);
    if (!prefs.channels.telegram || !prefs.kinds[notice.kind]) return "off";
    if (SKIP_WHEN_ONLINE.has(notice.kind) && (await isOnline(userId, now))) return "online";

    const db = getDb();
    if (notice.kind === "matching") {
      const [recent] = await db
        .select({ total: count() })
        .from(notificationLog)
        .where(and(eq(notificationLog.userId, userId), eq(notificationLog.kind, "matching"), gt(notificationLog.createdAt, now - DAY_MS)));
      if ((recent?.total ?? 0) >= MATCHING_DAILY_LIMIT) return "limit";
    }
    // Ключ займаємо до відправки: дві одночасні події не пошлють одне й те саме двічі.
    const claimed = await db.insert(notificationLog).values({ key: notice.key, userId, kind: notice.kind, createdAt: now }).onConflictDoNothing().returning({ key: notificationLog.key });
    if (claimed.length === 0) return "duplicate";

    const keyboard = notice.button ? { inline_keyboard: [[{ text: notice.button.text, url: `${config.siteUrl}${notice.button.path}` }]] } : undefined;
    const silent = prefs.quietHours && isQuietHour(now);
    const attempt = () => sendMessage(link.chatId, notice.html, { keyboard, silent });
    try {
      try {
        await attempt();
      } catch (error) {
        // Telegram просить зачекати: одна повторна спроба, якщо чекати недовго.
        if (error instanceof TelegramError && error.code === 429 && (error.retryAfter ?? 99) <= 5) {
          await sleep((error.retryAfter ?? 1) * 1000);
          await attempt();
        } else throw error;
      }
      return "sent";
    } catch (error) {
      // Не вдалося: ключ звільняємо, щоб наступна подія могла спробувати знову.
      await db.delete(notificationLog).where(eq(notificationLog.key, notice.key));
      if (error instanceof TelegramError && error.blocked) {
        await deactivateByChat(link.chatId, true);
        return "failed";
      }
      logServer({ level: "error", event: "telegram_send_failed", message: error instanceof Error ? error.message : String(error), detail: { kind: notice.kind } });
      return "failed";
    }
  } catch (error) {
    logServer({ level: "error", event: "notify_failed", message: error instanceof Error ? error.message : String(error), detail: { stack: error instanceof Error ? error.stack : null } });
    return "failed";
  }
};

/** Не затримує відповідь API: відправка добігає після неї. */
export const notifyLater = (userId: string | null | undefined, notice: Notice | null): void => {
  if (!userId || !notice) return;
  const work = notifyUser(userId, notice);
  if (telemetryConfig.waitUntil) telemetryConfig.waitUntil(work);
  else void work;
};
