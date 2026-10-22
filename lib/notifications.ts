"use client";

// lib/notifications.ts
//
// Сповіщення: що людина хоче отримувати й де. Налаштування лежать на сервері
// (lib/server/notification-prefs-repo.ts), а в localStorage як кеш і для
// гостя: сервер перед відправкою Telegram чи листа питає саме їх. Браузерні
// сповіщення працюють у межах відкритої вкладки через Notification API.

import { DEFAULT_PREFS, mergePrefs, parsePrefs, type NotificationPrefs, type PrefsPatch } from "@/lib/notification-prefs";
import { sessionStore } from "@/lib/auth/client";
import { createStore, useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

export type { NotificationPrefs } from "@/lib/notification-prefs";

const KEY = "vm:notifications";
const SAVE_DELAY_MS = 500;

export const prefsStore = createStore<NotificationPrefs>(DEFAULT_PREFS);

const writeLocal = (prefs: NotificationPrefs) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Запам'ятаємо до перезавантаження.
  }
};

/** З localStorage; старий плоский формат {email, push, telegram} переноситься. */
export const loadPrefs = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) prefsStore.set(parsePrefs(JSON.parse(raw)));
  } catch {
    // Без сховища лишаються типові.
  }
};

let saveTimer = 0;
const saveToServer = () => {
  if (sessionStore.get().status !== "user") return;
  window.clearTimeout(saveTimer);
  // Перемикач можуть клацати підряд: на сервер їде останній стан, а не кожне натискання.
  saveTimer = window.setTimeout(() => {
    void fetch("/api/notifications/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(prefsStore.get()) }).catch(() => {});
  }, SAVE_DELAY_MS);
};

export const setPrefs = (patch: PrefsPatch) => {
  const next = mergePrefs(prefsStore.get(), patch);
  prefsStore.set(next);
  writeLocal(next);
  saveToServer();
  if (patch.kinds || patch.channels || patch.quietHours !== undefined) {
    const [group, value] = patch.channels ? ["channel", patch.channels] : patch.kinds ? ["kind", patch.kinds] : ["quiet_hours", { on: patch.quietHours }];
    const [name, on] = Object.entries(value)[0] ?? ["", false];
    track(EVENTS.notificationPrefsChanged, { group, name, on: Boolean(on) });
  }
};

/**
 * Після входу: беремо налаштування з сервера. Якщо там ще нічого не
 * зберігали, а в браузері вибір є, переносимо його на сервер: людина вже
 * вибирала, і це не має загубитися.
 */
export const syncPrefsWithServer = async (): Promise<void> => {
  if (sessionStore.get().status !== "user") return;
  try {
    const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
    if (!response.ok) return;
    const { prefs, stored } = (await response.json()) as { prefs: NotificationPrefs; stored: boolean };
    if (stored) {
      prefsStore.set(prefs);
      writeLocal(prefs);
    } else if (JSON.stringify(prefsStore.get()) !== JSON.stringify(DEFAULT_PREFS)) {
      saveToServer();
    }
  } catch {
    // Лишається локальне.
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
  setPrefs({ channels: { push: result === "granted" } });
  if (result === "granted") track(EVENTS.pushEnabled);
  return result;
};

/** Показати сповіщення, якщо їх увімкнено, дозвіл є і вкладка у фоні. */
export const notifyUser = (title: string, body: string) => {
  if (!prefsStore.get().channels.push || pushState() !== "granted" || !document.hidden) return;
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
