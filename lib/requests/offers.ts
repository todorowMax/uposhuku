// lib/requests/offers.ts
//
// Пропозиції виконавців у браузері: який запит зараз на місці поля,
// відгуки на нього (опитування раз на кілька секунд, поки немає
// WebSocket), що людина відхилила і з ким листується. Відхилення й
// листування поки лише в цьому браузері (localStorage), у D1 — пізніше.

import { useEffect, useMemo, useRef, useState } from "react";
import { activeRequestStore, authFlowStore, composingStore, requestsStore, sessionStore } from "@/lib/auth/client";
import { startPolling } from "@/lib/realtime/client";
import { createStore, useStore } from "@/lib/store";
import type { OfferResponse, PublishedRequest } from "./types";

/** Запит, що стоїть на місці поля, або null — тоді показуємо поле. */
export const useActiveRequest = (): PublishedRequest | null => {
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  const activeId = useStore(activeRequestStore);
  const composing = useStore(composingStore);
  const authFlow = useStore(authFlowStore);
  if (session.status !== "user" || composing || authFlow) return null;
  return requests?.find((request) => request.id === activeId) ?? null;
};

/** Панель праворуч: список пропозицій або чат з одним виконавцем. */
export type OffersView = { kind: "list" } | { kind: "chat"; responseId: string };
export const offersViewStore = createStore<OffersView>({ kind: "list" });
/** Панель згорнута в язичок (на телефоні — шторка опущена). */
export const offersCollapsedStore = createStore(false);
/** Чат у правій колонці розтягнуто вліво (лише на широкому екрані). */
export const offersWideStore = createStore(false);
/** Скільки пропозицій уже прийшло на активний запит: для кроків у картці запиту. */
export const offersCountStore = createStore(0);
/** Скільки нових пропозицій чекає за «+N нових»: для сповіщень і лічильника у вкладці. */
export const offersPendingStore = createStore(0);
/** Попросити карту показати виконавця: камера летить до нього й відкриває картку. */
export const focusPerformerStore = createStore<{ id: string; at: number } | null>(null);

const POLL_MS = 4000;

const readSet = (key: string): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
};

const writeSet = (key: string, value: string[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Без сховища відхилення живе до перезавантаження.
  }
};

/**
 * Відгуки на запит. Перший список показуємо одразу, а ті, що прийшли
 * потім, чекають у pending: панель не стрибає під рукою, людина сама
 * натискає «+N нових» (питання 4.4 у вкладці UI).
 */
export const useOffers = (request: PublishedRequest | null) => {
  const [shown, setShown] = useState<OfferResponse[] | null>(null);
  const [pending, setPending] = useState<OfferResponse[]>([]);
  const [declined, setDeclined] = useState<string[]>([]);
  /** Що вже на екрані: нове порівнюємо з ним, щоб решта списку не рухалась. */
  const shownIds = useRef(new Set<string>());
  const requestId = request?.status === "open" ? request.id : null;

  useEffect(() => {
    setShown(null);
    setPending([]);
    setDeclined(requestId ? readSet(`vm:declined:${requestId}`) : []);
    if (!requestId) return;
    let cancelled = false;
    let first = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/responses`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const { responses } = (await response.json()) as { responses: OfferResponse[] };
        if (cancelled) return;
        if (first) {
          first = false;
          shownIds.current = new Set(responses.map((item) => item.id));
          setShown(responses);
          return;
        }
        // Список ще порожній: нічого зсувати, перші одразу на екран.
        if (shownIds.current.size === 0 && responses.length > 0) {
          shownIds.current = new Set(responses.map((item) => item.id));
          setShown(responses);
          setPending([]);
          return;
        }
        setPending(responses.filter((item) => !shownIds.current.has(item.id)));
      } catch {
        // Мережа моргнула — спробуємо наступного разу.
      }
    };
    void load();
    const stop = startPolling(() => void load(), POLL_MS, ["offer"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [requestId]);

  const all = useMemo(() => [...(shown ?? []), ...pending], [shown, pending]);
  useEffect(() => offersCountStore.set(all.length), [all.length]);
  useEffect(() => offersPendingStore.set(pending.length), [pending.length]);

  /** Нові стають на свої місця: за оплатою, як і решта. */
  const revealPending = () => {
    for (const item of pending) shownIds.current.add(item.id);
    setShown((current) => [...(current ?? []), ...pending].sort((a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt)));
    setPending([]);
  };

  const setDeclinedFor = (next: string[]) => {
    setDeclined(next);
    if (requestId) writeSet(`vm:declined:${requestId}`, next);
  };

  return {
    loading: shown === null && Boolean(requestId),
    offers: (shown ?? []).filter((item) => !declined.includes(item.id)),
    declinedOffers: (shown ?? []).filter((item) => declined.includes(item.id)),
    pending,
    all,
    revealPending,
    decline: (id: string) => setDeclinedFor([...declined, id]),
    restore: (id: string) => setDeclinedFor(declined.filter((item) => item !== id)),
  };
};

/**
 * Картка запиту згорнута в смужку по центру: лише статус, крок і скільки
 * пропозицій. Вибір пам'ятаємо в браузері.
 */
export const dockCompactStore = createStore(false);
const COMPACT_KEY = "vm:dock-compact";

export const loadDockCompact = () => {
  try {
    const saved = window.localStorage.getItem(COMPACT_KEY);
    // Вибору ще не було: на телефоні карта важливіша за картку, тож починаємо зі смужки.
    dockCompactStore.set(saved === null ? window.innerWidth < 640 : saved === "1");
  } catch {
    dockCompactStore.set(window.innerWidth < 640);
  }
};

export const setDockCompact = (compact: boolean) => {
  dockCompactStore.set(compact);
  try {
    window.localStorage.setItem(COMPACT_KEY, compact ? "1" : "0");
  } catch {
    // Запам'ятаємо до перезавантаження.
  }
};
