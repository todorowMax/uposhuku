"use client";

// lib/notifications.ts
//
// Сповіщення: що людина хоче отримувати й як. Браузерні (веб-пуш у межах
// відкритої вкладки) працюють по-справжньому, через Notification API;
// пошта й Telegram поки лише налаштування, самі канали прийдуть із
// бекендом (Resend, бот). Вибір лежить у браузері.

import { createStore, useStore } from "@/lib/store";

export interface NotificationPrefs {
  /** Пошта: нові пропозиції, повідомлення, угоди. */
  email: boolean;
  /** Сповіщення браузера, коли вкладка у фоні. */
  push: boolean;
  /** Особистий Telegram-бот. Скоро. */
  telegram: boolean;
}

const KEY = "vm:notifications";
const DEFAULTS: NotificationPrefs = { email: true, push: false, telegram: false };

export const prefsStore = createStore<NotificationPrefs>(DEFAULTS);

export const loadPrefs = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) prefsStore.set({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) });
  } catch {
    // Без сховища лишаються типові.
  }
};

export const setPrefs = (patch: Partial<NotificationPrefs>) => {
  const next = { ...prefsStore.get(), ...patch };
  prefsStore.set(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Запам'ятаємо до перезавантаження.
  }
};

export const usePrefs = () => useStore(prefsStore);

export type PushState = "unsupported" | "denied" | "default" | "granted";

export const pushState = (): PushState => {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
};

/** Увімкнути сповіщення браузера: просимо дозвіл лише по кліку людини. */
export const enablePush = async (): Promise<PushState> => {
  if (pushState() === "unsupported") return "unsupported";
  const result = pushState() === "granted" ? "granted" : await Notification.requestPermission();
  setPrefs({ push: result === "granted" });
  return result;
};

/** Показати сповіщення, якщо їх увімкнено, дозвіл є і вкладка у фоні. */
export const notifyUser = (title: string, body: string) => {
  if (!prefsStore.get().push || pushState() !== "granted" || !document.hidden) return;
  try {
    const note = new Notification(title, { body, icon: "/favicon.ico", tag: "vibe-map" });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    // Деякі браузери (Android) не дають створювати Notification зі сторінки.
  }
};
