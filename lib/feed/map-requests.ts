"use client";

// lib/feed/map-requests.ts
//
// Режим карти «Запити»: що на карті (виконавці чи запити), які запити, який
// вибрано. Дані — з /api/map/requests, опитування лише коли режим увімкнено.

import { useEffect } from "react";
import { createStore, useStore } from "@/lib/store";
import { profileStore } from "@/lib/profile/client";
import { requestsStore, sessionStore } from "@/lib/auth/client";
import { onRealtime, startPolling } from "@/lib/realtime/client";
import type { FeedItem, MapRequest } from "./types";

export type MapMode = "performers" | "requests";
export const mapModeStore = createStore<MapMode>("performers");
/** Окремий огляд усіх розробників, незалежно від відгуків на активний запит. */
export const allPerformersStore = createStore(false);

const canViewRequests = () => {
  const profile = profileStore.get();
  return sessionStore.get().status === "user" && profile.status === "ready" && Boolean(profile.profile?.published);
};

const MODE_KEY = "vm:map-mode";
let modeChosen = false;

export const setMapMode = (mode: MapMode) => {
  if (mode === "requests" && !canViewRequests()) return;
  modeChosen = true;
  allPerformersStore.set(false);
  mapModeStore.set(mode);
  mapSelectedRequest.set(null);
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Без сховища вибір живе до перезавантаження.
  }
};

export const showAllPerformers = () => {
  modeChosen = true;
  mapModeStore.set("performers");
  mapSelectedRequest.set(null);
  allPerformersStore.set(true);
};

/** Запити на карті й чи є в людини опублікований профіль виконавця. */
export const mapRequestsStore = createStore<{ items: MapRequest[]; performer: boolean; loaded: boolean }>({ items: [], performer: false, loaded: false });
/** Вибраний на карті запит (id) — відкриває картку. */
export const mapSelectedRequest = createStore<string | null>(null);
/** Остання картка під курсором у відкритій панелі запитів. */
export const hoveredFeedRequestStore = createStore<string | null>(null);

export type RequestFilter = "all" | "matched" | "urgent" | "budget" | "remote";
export const requestFilterStore = createStore<RequestFilter>("all");

const POLL_MS = 6000;

export const loadMapRequests = async () => {
  if (!canViewRequests()) return;
  try {
    const response = await fetch("/api/map/requests", { cache: "no-store" });
    if (!response.ok) return;
    const { items, performer } = (await response.json()) as { items: MapRequest[]; performer: boolean };
    if (!canViewRequests()) return;
    mapRequestsStore.set({ items, performer, loaded: true });
  } catch {
    // Мережа моргнула: лишаємо, що було.
  }
};

/** Оновити один запит після відгуку, не чекаючи опитування. */
export const patchMapRequest = (id: string, change: (item: FeedItem) => FeedItem) => {
  const current = mapRequestsStore.get();
  mapRequestsStore.set({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...change(item) } : item)) });
};

/** Які запити лишити під вибраний фільтр. */
export const applyRequestFilter = (items: MapRequest[], filter: RequestFilter): MapRequest[] => {
  if (filter === "matched") return items.filter((item) => item.matchedTags > 0 && !item.own);
  if (filter === "urgent") return items.filter((item) => item.deadline === "Терміново, до 3 днів" || item.deadline === "Протягом тижня");
  if (filter === "budget") return items.filter((item) => item.budget);
  // Без міста: піна на карті немає, такі запити живуть лише в списку.
  if (filter === "remote") return items.filter((item) => !item.point);
  return items;
};

/**
 * Тримає запити на карті свіжими, поки увімкнено режим «Запити», і вибирає
 * режим за замовчуванням: виконавцю без свого запиту — «Запити» (він шукає
 * роботу), решті — «Виконавці». Монтується один раз.
 */
export function MapRequestsSync() {
  const mode = useStore(mapModeStore);
  const session = useStore(sessionStore);
  const profile = useStore(profileStore);
  const requests = useStore(requestsStore);

  useEffect(() => {
    if (requests && !requests.some((request) => request.status === "open")) allPerformersStore.set(false);
  }, [requests]);

  // Гість і замовник завжди бачать виконавців, навіть якщо в браузері зберігся інший вибір.
  useEffect(() => {
    const performer = session.status === "user" && profile.status === "ready" && Boolean(profile.profile?.published);
    if (!performer) {
      mapModeStore.set("performers");
      mapSelectedRequest.set(null);
      if (session.status === "guest" || !requests?.some((request) => request.status === "open")) allPerformersStore.set(false);
      if (session.status === "guest") modeChosen = false;
      return;
    }
    if (modeChosen || requests === null) return;
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === "performers" || saved === "requests") {
        modeChosen = true;
        mapModeStore.set(saved);
        return;
      }
    } catch {
      // Без сховища вирішуємо за роллю.
    }
    modeChosen = true;
    const hasOpenRequest = requests.some((request) => request.status === "open");
    if (!hasOpenRequest) mapModeStore.set("requests");
  }, [session.status, profile, requests]);

  // Дані запитів потрібні лише авторизованому виконавцю.
  useEffect(() => {
    if (!canViewRequests()) return;
    void loadMapRequests();
    // Новий чи закритий запит оновлює лічильник на перемикачі одразу, у будь-якому режимі.
    return onRealtime((event) => event.t === "feed" && void loadMapRequests());
  }, [session.status, profile]);

  useEffect(() => {
    if (mode !== "requests" || !canViewRequests()) return;
    void loadMapRequests();
    // Запасне опитування лише в режимі запитів; події «feed» обробляє ефект вище.
    return startPolling(() => void loadMapRequests(), POLL_MS, []);
  }, [mode, session.status, profile]);

  // Вийшли з акаунта: вибір «виконавці» повертаємо, дані скидаємо.
  useEffect(() => {
    if (session.status !== "user" || profile.status !== "ready" || !profile.profile?.published) {
      mapRequestsStore.set({ items: [], performer: false, loaded: false });
    }
  }, [session.status, profile]);

  return null;
}

export const useMapMode = () => useStore(mapModeStore);
