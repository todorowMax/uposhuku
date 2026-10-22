"use client";

// lib/telegram/link-client.ts
//
// Підключення Telegram у браузері: «Підключити» відкриває бота з одноразовим
// посиланням, а сайт чекає підтвердження: подією реального часу (бот її
// штовхає, щойно людина натисне Start) і запасним опитуванням.

import { useStore, createStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

export interface TelegramState {
  loaded: boolean;
  /** Бот налаштований на сервері. Ні: рядок лишається з поясненням «скоро». */
  available: boolean;
  linked: boolean;
  username: string | null;
  /** Людина заблокувала бота: треба підключити ще раз. */
  blocked: boolean;
  /** Відкрили бота й чекаємо підтвердження. */
  waiting: boolean;
  error: string | null;
}

const EMPTY: TelegramState = { loaded: false, available: false, linked: false, username: null, blocked: false, waiting: false, error: null };
export const telegramStore = createStore<TelegramState>(EMPTY);
export const useTelegram = () => useStore(telegramStore);

/** Скільки чекаємо, поки людина натисне Start у Telegram. */
export const WAIT_MS = 3 * 60 * 1000;
let waitTimer = 0;

export const loadTelegram = async (): Promise<void> => {
  try {
    const response = await fetch("/api/telegram/link", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as Pick<TelegramState, "available" | "linked" | "username" | "blocked">;
    const current = telegramStore.get();
    // Підключилось: чекати більше нічого.
    const waiting = current.waiting && !data.linked;
    if (current.waiting && data.linked) window.clearTimeout(waitTimer);
    telegramStore.set({ ...current, ...data, loaded: true, waiting });
  } catch {
    // Мережа моргнула: лишається, що було.
  }
};

const stopWaiting = () => {
  window.clearTimeout(waitTimer);
  telegramStore.set({ ...telegramStore.get(), waiting: false });
};

export const startTelegramLink = async (): Promise<void> => {
  telegramStore.set({ ...telegramStore.get(), error: null });
  let response: Response;
  try {
    response = await fetch("/api/telegram/link", { method: "POST" });
  } catch {
    telegramStore.set({ ...telegramStore.get(), error: "Немає зв'язку. Спробуйте ще раз." });
    return;
  }
  const data = (await response.json().catch(() => null)) as { url?: string; detail?: string } | null;
  if (!response.ok || !data?.url) {
    telegramStore.set({ ...telegramStore.get(), error: data?.detail ?? "Не вдалося підключити Telegram." });
    return;
  }
  track(EVENTS.telegramLinkStarted);
  telegramStore.set({ ...telegramStore.get(), waiting: true });
  window.clearTimeout(waitTimer);
  waitTimer = window.setTimeout(stopWaiting, WAIT_MS);
  // На телефоні відкриється застосунок Telegram.
  window.open(data.url, "_blank", "noopener");
};

export const cancelTelegramLink = stopWaiting;

export const disconnectTelegram = async (): Promise<void> => {
  telegramStore.set({ ...telegramStore.get(), linked: false, username: null, blocked: false, waiting: false });
  await fetch("/api/telegram/link", { method: "DELETE" }).catch(() => {});
};
