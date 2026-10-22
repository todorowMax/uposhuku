// lib/telegram/config.ts
//
// Налаштування бота з оточення воркера. Немає токена чи секрету вебхука:
// усе мовчки вимкнено, як пошта без ключа Resend. Читаємо щоразу, а не під
// час збирання: застосунок збирається один раз для кількох середовищ.

import { readVar } from "@/lib/server/env";

export interface TelegramConfig {
  /** Бот увімкнений: є токен і секрет вебхука. */
  enabled: boolean;
  token: string | null;
  webhookSecret: string | null;
  /** Без @. */
  username: string | null;
  channelId: string | null;
  siteUrl: string;
  channelEnabled: boolean;
  /** Через скільки хвилин запит потрапляє в канал. */
  channelDelayMin: number;
}

export const DEFAULT_CHANNEL_DELAY_MIN = 20;

const text = (name: Parameters<typeof readVar>[0]) => readVar(name)?.trim() || null;

export const telegramConfig = (): TelegramConfig => {
  const token = text("TELEGRAM_BOT_TOKEN");
  const webhookSecret = text("TELEGRAM_WEBHOOK_SECRET");
  const delay = Number(text("CHANNEL_DELAY_MIN"));
  return {
    enabled: Boolean(token && webhookSecret),
    token,
    webhookSecret,
    username: text("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "") ?? null,
    channelId: text("TELEGRAM_CHANNEL_ID"),
    siteUrl: (text("SITE_URL") ?? "http://localhost:3031").replace(/\/$/, ""),
    channelEnabled: text("CHANNEL_ENABLED") === "1",
    channelDelayMin: Number.isFinite(delay) && delay >= 0 ? delay : DEFAULT_CHANNEL_DELAY_MIN,
  };
};

/** Посилання на бота з параметром start: `t.me/<bot>?start=<токен>`. */
export const botLink = (config: TelegramConfig, start?: string): string | null =>
  config.username ? `https://t.me/${config.username}${start ? `?start=${encodeURIComponent(start)}` : ""}` : null;
