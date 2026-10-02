"use client";

// lib/feed/client.ts
//
// Стрічка запитів у браузері: опитування раз на кілька секунд, «нові»
// чекають за кнопкою й не стрибають під рукою (як пропозиції замовника),
// відгук і відкликання.

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { createStore } from "@/lib/store";
import type { FeedItem, MyResponse } from "./types";

const POLL_MS = 5000;

/** Скільки запитів у стрічці: для кнопки в меню й язичка. */
export const feedCountStore = createStore(0);

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
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string }) | null;
  if (!response.ok) throw new ApiError(data?.detail ?? data?.title ?? "Щось пішло не так. Спробуйте ще раз.");
  return data as T;
};

const order = (a: FeedItem, b: FeedItem) => b.matchedTags - a.matchedTags || b.createdAt.localeCompare(a.createdAt);

/**
 * Стрічка під теги профілю. Перший список показуємо одразу; що прийшло
 * потім — у pending, поки людина не натисне «+N нових».
 */
export const useFeed = (enabled: boolean) => {
  const [shown, setShown] = useState<FeedItem[] | null>(null);
  const [pending, setPending] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const shownIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      setShown(null);
      setPending([]);
      return;
    }
    let cancelled = false;
    let first = true;
    const load = async () => {
      try {
        const { items } = await call<{ items: FeedItem[] }>("/api/feed");
        if (cancelled) return;
        setError(null);
        if (first) {
          first = false;
          shownIds.current = new Set(items.map((item) => item.id));
          setShown(items);
          return;
        }
        // Список ще порожній: нічого зсувати, перші одразу на екран.
        if (shownIds.current.size === 0 && items.length > 0) {
          shownIds.current = new Set(items.map((item) => item.id));
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
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const items = useMemo(() => shown ?? [], [shown]);
  useEffect(() => feedCountStore.set(items.length + pending.length), [items.length, pending.length]);

  const reveal = () => {
    for (const item of pending) shownIds.current.add(item.id);
    setShown((current) => [...(current ?? []), ...pending].sort(order));
    setPending([]);
  };

  /** Оновити один запит після відгуку, не чекаючи наступного опитування. */
  const patch = (id: string, change: (item: FeedItem) => FeedItem) =>
    setShown((current) => (current ?? []).map((item) => (item.id === id ? change(item) : item)));

  return { loading: enabled && shown === null && !error, error, items, pending, reveal, patch };
};

export const sendResponse = async (requestId: string, value: Pick<MyResponse, "price" | "days" | "message">) =>
  (await call<{ response: MyResponse }>(`/api/feed/${encodeURIComponent(requestId)}/response`, { method: "PUT", body: JSON.stringify(value) })).response;

export const withdrawResponse = (requestId: string) =>
  call<void>(`/api/feed/${encodeURIComponent(requestId)}/response`, { method: "DELETE" });
