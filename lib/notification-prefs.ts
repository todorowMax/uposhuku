// lib/notification-prefs.ts
//
// Що людина хоче отримувати й де. Одна форма на клієнт і сервер: клієнт
// показує перемикачі, сервер перед відправкою Telegram чи листа питає, чи
// можна. Без рядка в базі діють значення за замовчуванням.

import { z } from "zod";

export const channelsSchema = z.object({
  /** Лист на пошту. */
  email: z.boolean(),
  /** Сповіщення браузера, поки вкладка у фоні. */
  push: z.boolean(),
  /** Особистий Telegram-бот. Діє лише з активною прив'язкою. */
  telegram: z.boolean(),
});

export const kindsSchema = z.object({
  /** Нові пропозиції на мій запит. */
  offers: z.boolean(),
  /** Нові повідомлення в чаті. */
  messages: z.boolean(),
  /** Угоди: прийняли, оплатили, здали етап. */
  deals: z.boolean(),
  /** Нові запити під мої теги (для виконавця). */
  matching: z.boolean(),
  /** Теги з моїх пропозицій додано до словника. */
  tags: z.boolean(),
});

export const prefsSchema = z.object({
  channels: channelsSchema,
  kinds: kindsSchema,
  /** З 23:00 до 08:00 за Києвом сповіщення без звуку. */
  quietHours: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof prefsSchema>;
export type NotificationKind = keyof NotificationPrefs["kinds"];
export type PrefsPatch = {
  channels?: Partial<NotificationPrefs["channels"]>;
  kinds?: Partial<NotificationPrefs["kinds"]>;
  quietHours?: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  channels: { email: true, push: false, telegram: true },
  kinds: { offers: true, messages: true, deals: true, matching: true, tags: true },
  quietHours: true,
};

const bools = <T extends Record<string, boolean>>(base: T, patch: unknown): T => {
  if (!patch || typeof patch !== "object") return base;
  const next = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const value = (patch as Record<string, unknown>)[key as string];
    if (typeof value === "boolean") next[key] = value as T[keyof T];
  }
  return next;
};

/** Накладає частину на повні налаштування. Невідоме й не-булеве мовчки відкидає. */
export const mergePrefs = (current: NotificationPrefs, patch: unknown): NotificationPrefs => {
  const raw = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  return {
    channels: bools(current.channels, raw.channels),
    kinds: bools(current.kinds, raw.kinds),
    quietHours: typeof raw.quietHours === "boolean" ? raw.quietHours : current.quietHours,
  };
};

/** Збережене в базі чи localStorage (можливо старого плоского вигляду {email, push, telegram}) → повні налаштування. */
export const parsePrefs = (stored: unknown): NotificationPrefs => {
  if (stored && typeof stored === "object" && !("channels" in stored) && ("email" in stored || "push" in stored || "telegram" in stored)) {
    return mergePrefs(DEFAULT_PREFS, { channels: stored });
  }
  return mergePrefs(DEFAULT_PREFS, stored);
};
