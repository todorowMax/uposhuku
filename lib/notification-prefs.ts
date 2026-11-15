// lib/notification-prefs.ts
//
// Що людина хоче отримувати й де. Одна форма на клієнт і сервер: клієнт
// показує перемикачі, сервер перед відправкою Telegram чи листа питає, чи
// можна. Без рядка в базі діють значення за замовчуванням.

import { z } from "zod";
import { CITIES } from "@/lib/map/cities";

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

/** Поріг збігу тегів, від якого запит узагалі пропонуємо (дзеркало `MATCH_THRESHOLD` у lib/tags/match.ts: тут його не імпортуємо, щоб словник тегів не потрапив у клієнтський код; тест звіряє обидва). */
export const BASE_MATCH = 0.6;
/** Рівні порогу збігу тегів: від «схожі» (як було) до «лише точний тег». */
export const MATCH_LEVELS = [BASE_MATCH, 0.8, 1] as const;
/** Звідки приймати запити: лише з мого міста, з усієї України чи з вибраних міст. */
export const MATCH_AREAS = ["own", "all", "chosen"] as const;
export const MAX_CHOSEN_CITIES = 30;

/** Які запити під теги варті сповіщення (для виконавця). Типово: як було до цих налаштувань. */
export const matchingSchema = z.object({
  /** Мінімальна схожість тегів запиту з профілем; не нижче `BASE_MATCH`. */
  minMatch: z.number().min(BASE_MATCH).max(1),
  /** Мінімальний бюджет запиту в гривнях; 0 — будь-який. Запит без бюджету не відсіюється. */
  minBudget: z.number().int().min(0),
  area: z.enum(MATCH_AREAS),
  /** Міста для area = chosen (id з lib/map/cities.ts). */
  cityIds: z.array(z.string()).max(MAX_CHOSEN_CITIES),
});

export const prefsSchema = z.object({
  channels: channelsSchema,
  kinds: kindsSchema,
  matching: matchingSchema,
  /** З 23:00 до 08:00 за Києвом сповіщення без звуку. */
  quietHours: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof prefsSchema>;
export type MatchingPrefs = z.infer<typeof matchingSchema>;
export type NotificationKind = keyof NotificationPrefs["kinds"];
export type PrefsPatch = {
  channels?: Partial<NotificationPrefs["channels"]>;
  kinds?: Partial<NotificationPrefs["kinds"]>;
  matching?: Partial<MatchingPrefs>;
  quietHours?: boolean;
};

export const DEFAULT_MATCHING: MatchingPrefs = { minMatch: BASE_MATCH, minBudget: 0, area: "all", cityIds: [] };

export const DEFAULT_PREFS: NotificationPrefs = {
  channels: { email: true, push: false, telegram: true },
  kinds: { offers: true, messages: true, deals: true, matching: true, tags: true },
  matching: DEFAULT_MATCHING,
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

const CITY_IDS = new Set(CITIES.map((city) => city.id));
const MAX_BUDGET = 10_000_000;

/** Накладає частину на налаштування підбору: що не підійшло за типом чи межами, відкидається. */
const mergeMatching = (current: MatchingPrefs, patch: unknown): MatchingPrefs => {
  if (!patch || typeof patch !== "object") return current;
  const raw = patch as Record<string, unknown>;
  const next = { ...current };
  if (typeof raw.minMatch === "number" && MATCH_LEVELS.includes(raw.minMatch as (typeof MATCH_LEVELS)[number])) next.minMatch = raw.minMatch;
  if (typeof raw.minBudget === "number" && Number.isFinite(raw.minBudget)) next.minBudget = Math.min(MAX_BUDGET, Math.max(0, Math.round(raw.minBudget)));
  if (typeof raw.area === "string" && (MATCH_AREAS as readonly string[]).includes(raw.area)) next.area = raw.area as MatchingPrefs["area"];
  if (Array.isArray(raw.cityIds)) next.cityIds = [...new Set(raw.cityIds.filter((id): id is string => typeof id === "string" && CITY_IDS.has(id)))].slice(0, MAX_CHOSEN_CITIES);
  return next;
};

/** Накладає частину на повні налаштування. Невідоме й не-булеве мовчки відкидає. */
export const mergePrefs = (current: NotificationPrefs, patch: unknown): NotificationPrefs => {
  const raw = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  return {
    channels: bools(current.channels, raw.channels),
    kinds: bools(current.kinds, raw.kinds),
    matching: mergeMatching(current.matching, raw.matching),
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
