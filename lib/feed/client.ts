"use client";

// lib/feed/client.ts
//
// Стрічка запитів у браузері: опитування раз на кілька секунд, «нові»
// чекають за кнопкою й не стрибають під рукою (як пропозиції замовника),
// відгук і відкликання.

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, problemError } from "@/lib/auth/client";
import { startPolling } from "@/lib/realtime/client";
import { createStore } from "@/lib/store";
import { compareRank } from "./rank";
import type { FeedItem, FeedPage, MyResponse } from "./types";

const POLL_MS = 5000;

/** Скільки відкритих чужих запитів усього (з сервера, не лише завантажених): для кнопки в меню й язичка. */
export const feedCountStore = createStore(0);
/** Нові запити, що чекають за «+N нових». */
export const feedPendingStore = createStore(0);

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      cache: "no-store",
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Немає зв'язку. Перевірте інтернет і спробуйте ще раз.");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string; code?: string }) | null;
  if (!response.ok) throw problemError(data);
  return data as T;
};

const order = (a: FeedItem, b: FeedItem) => compareRank(rankKey(a), rankKey(b));

const rankKey = (item: FeedItem) => ({ matched: item.matchedTags, city: item.sameCity, createdAt: Date.parse(item.createdAt), id: item.id });

const feedUrl = (cursor: string | null) => (cursor ? `/api/feed?cursor=${encodeURIComponent(cursor)}` : "/api/feed");

/**
 * Стрічка під теги профілю. Перша сторінка видна одразу; що прийшло потім
 * на першій сторінці — у pending, поки людина не натисне «+N нових».
 * «Показати ще» дописує наступні сторінки за курсором.
 */
export const useFeed = (enabled: boolean) => {
  const [shown, setShown] = useState<FeedItem[] | null>(null);
  const [pending, setPending] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const shownIds = useRef(new Set<string>());
  // Курсор «Показати ще» живе й у ref: обробник не мусить бачити застарілий стан.
  const nextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setShown(null);
      setPending([]);
      setNext(null);
      setTotal(0);
      return;
    }
    let cancelled = false;
    let first = true;
    const load = async () => {
      try {
        const page = await call<FeedPage>(feedUrl(null));
        if (cancelled) return;
        const { items } = page;
        setError(null);
        setTotal(page.total);
        if (first) {
          first = false;
          shownIds.current = new Set(items.map((item) => item.id));
          nextRef.current = page.next;
          setNext(page.next);
          setShown(items);
          return;
        }
        // Список ще порожній: нічого зсувати, перші одразу на екран.
        if (shownIds.current.size === 0 && items.length > 0) {
          shownIds.current = new Set(items.map((item) => item.id));
          nextRef.current = page.next;
          setNext(page.next);
          setShown(items);
          setPending([]);
          return;
        }
        // Уже показані оновлюємо на місці (лічильники відгуків), нові чекають.
        const byId = new Map(items.map((item) => [item.id, item]));
        setShown((current) => (current ?? []).map((item) => byId.get(item.id) ?? item));
        setPending(items.filter((item) => !shownIds.current.has(item.id)));
      } catch (reason) {
        if (!cancelled && first) setError(reason instanceof ApiError ? reason.message : "Не вдалося завантажити запити.");
      }
    };
    void load();
    const stop = startPolling(() => void load(), POLL_MS, ["feed"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled]);

  const items = useMemo(() => shown ?? [], [shown]);
  useEffect(() => feedCountStore.set(total), [total]);
  useEffect(() => feedPendingStore.set(pending.length), [pending.length]);

  const reveal = () => {
    for (const item of pending) shownIds.current.add(item.id);
    setShown((current) => [...(current ?? []), ...pending].sort(order));
    setPending([]);
  };

  /** Дописати наступну сторінку; уже показане не дублюємо. */
  const loadMore = async () => {
    const cursor = nextRef.current;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await call<FeedPage>(feedUrl(cursor));
      const fresh = page.items.filter((item) => !shownIds.current.has(item.id));
      for (const item of fresh) shownIds.current.add(item.id);
      nextRef.current = page.next;
      setNext(page.next);
      setTotal(page.total);
      setShown((current) => [...(current ?? []), ...fresh]);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося завантажити ще запити.");
    } finally {
      setLoadingMore(false);
    }
  };

  /** Оновити один запит після відгуку, не чекаючи наступного опитування. */
  const patch = (id: string, change: (item: FeedItem) => FeedItem) =>
    setShown((current) => (current ?? []).map((item) => (item.id === id ? change(item) : item)));

  return { loading: enabled && shown === null && !error, error, items, pending, total, hasMore: next !== null, loadingMore, loadMore, reveal, patch };
};

export const sendResponse = async (requestId: string, value: Pick<MyResponse, "price" | "days" | "message">) =>
  (await call<{ response: MyResponse }>(`/api/feed/${encodeURIComponent(requestId)}/response`, { method: "PUT", body: JSON.stringify(value) })).response;

export const withdrawResponse = (requestId: string) =>
  call<void>(`/api/feed/${encodeURIComponent(requestId)}/response`, { method: "DELETE" });
