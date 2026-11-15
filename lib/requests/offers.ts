// lib/requests/offers.ts
//
// Пропозиції виконавців у браузері: який запит зараз на місці поля,
// відгуки на нього (опитування раз на кілька секунд, поки немає
// WebSocket) і рішення щодо них. Статус відгуку (новий, в обраних,
// відхилено, обрано) живе на сервері, тож однаковий на всіх пристроях.

import { useEffect, useMemo, useRef, useState } from "react";
import { activeRequestStore, authFlowStore, composingStore, requestsStore, sessionStore } from "@/lib/auth/client";
import { startPolling } from "@/lib/realtime/client";
import { createStore, useStore } from "@/lib/store";
import type { OfferResponse, PublishedRequest, ResponseStatus } from "./types";

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
export const offersCollapsedStore = createStore(true);
/** Чат у правій колонці розтягнуто вліво (лише на широкому екрані). */
export const offersWideStore = createStore(false);
/** На мапі активного запиту показуємо тільки виконавців, які вже відгукнулися. */
export const offersMapStore = createStore<{ requestId: string | null; responses: OfferResponse[] }>({
  requestId: null,
  responses: [],
});
/** Скільки пропозицій уже прийшло на активний запит: для кроків у картці запиту. */
export const offersCountStore = createStore(0);
/** Скільки нових пропозицій чекає за «+N нових»: для сповіщень і лічильника у вкладці. */
export const offersPendingStore = createStore(0);
/** Попросити карту показати виконавця: камера летить до нього й відкриває картку. */
export const focusPerformerStore = createStore<{ id: string; at: number; toggle?: boolean } | null>(null);
/** Картка пропозиції під курсором або у фокусі клавіатури. */
export const hoveredOfferStore = createStore<{ requestId: string; performerId: string } | null>(null);

const POLL_MS = 4000;

/**
 * Відгуки на запит. Перший список показуємо одразу, а ті, що прийшли
 * потім, чекають у pending: панель не стрибає під рукою, людина сама
 * натискає «+N нових» (питання 4.4 у вкладці UI).
 */
export const useOffers = (request: PublishedRequest | null) => {
  const [shown, setShown] = useState<OfferResponse[] | null>(null);
  const [pending, setPending] = useState<OfferResponse[]>([]);
  /** Не вдалося зберегти рішення: показуємо причину, а список лишається як був. */
  const [statusError, setStatusError] = useState<string | null>(null);
  /** Перший список не завантажився: показуємо помилку з повтором замість вічного спінера. */
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Що вже на екрані: нове порівнюємо з ним, щоб решта списку не рухалась. */
  const shownIds = useRef(new Set<string>());
  const requestId = request?.status === "open" ? request.id : null;

  useEffect(() => {
    setShown(null);
    setFailed(false);
    setPending([]);
    setStatusError(null);
    offersMapStore.set({ requestId, responses: [] });
    if (!requestId) return;
    let cancelled = false;
    let first = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/responses`, { cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const { responses } = (await response.json()) as { responses: OfferResponse[] };
        if (cancelled) return;
        setFailed(false);
        const currentMap = offersMapStore.get();
        if (currentMap.requestId !== requestId || currentMap.responses.length !== responses.length || responses.some((item, index) => item.id !== currentMap.responses[index]?.id)) {
          offersMapStore.set({ requestId, responses });
        }
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
        // Статуси з іншого пристрою підтягуємо в уже показані картки; новий масив лише коли щось справді змінилось.
        const fresh = new Map(responses.map((item) => [item.id, item.status]));
        setShown((current) => (current?.some((item) => fresh.has(item.id) && fresh.get(item.id) !== item.status) ? current.map((item) => ({ ...item, status: fresh.get(item.id) ?? item.status })) : current));
        setPending(responses.filter((item) => !shownIds.current.has(item.id)));
      } catch {
        // Мережа моргнула: наступний запит за таймером спробує знову, а поки показуємо помилку, якщо списку ще немає.
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const stop = startPolling(() => void load(), POLL_MS, ["offer"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [requestId, attempt]);

  const all = useMemo(() => [...(shown ?? []), ...pending], [shown, pending]);
  useEffect(() => offersCountStore.set(all.length), [all.length]);
  useEffect(() => offersPendingStore.set(pending.length), [pending.length]);

  /** Нові стають на свої місця: за оплатою, як і решта. */
  const revealPending = () => {
    for (const item of pending) shownIds.current.add(item.id);
    setShown((current) => [...(current ?? []), ...pending].sort((a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt)));
    setPending([]);
  };

  /** Рішення замовника: одразу на екрані, на сервері наступним кроком; збій повертає старий статус. */
  const setStatus = async (offer: OfferResponse, status: ResponseStatus): Promise<boolean> => {
    if (!requestId) return false;
    const apply = (value: ResponseStatus) => {
      const patch = (list: OfferResponse[]) => list.map((item) => (item.id === offer.id ? { ...item, status: value } : item));
      setShown((current) => (current === null ? current : patch(current)));
      setPending(patch);
    };
    const previous = offer.status;
    apply(status);
    setStatusError(null);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}/responses/${encodeURIComponent(offer.performerId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) return true;
      apply(previous);
      setStatusError("Не вдалося зберегти рішення. Спробуйте ще раз.");
      return false;
    } catch {
      apply(previous);
      setStatusError("Не вдалося зберегти рішення. Спробуйте ще раз.");
      return false;
    }
  };

  return {
    loading: shown === null && Boolean(requestId) && !failed,
    error: shown === null && failed,
    retry: () => setAttempt((value) => value + 1),
    offers: (shown ?? []).filter((item) => item.status !== "declined"),
    declinedOffers: (shown ?? []).filter((item) => item.status === "declined"),
    statusError,
    pending,
    all,
    revealPending,
    shortlist: (offer: OfferResponse) => setStatus(offer, "shortlisted"),
    unshortlist: (offer: OfferResponse) => setStatus(offer, "new"),
    decline: (offer: OfferResponse) => setStatus(offer, "declined"),
    restore: (offer: OfferResponse) => setStatus(offer, "new"),
    choose: (offer: OfferResponse) => setStatus(offer, "chosen"),
  };
};
