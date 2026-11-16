"use client";

// lib/chat/client.ts
//
// Живий чат із виконавцем-акаунтом через /api/conversations. Реальний час —
// опитування `?since=`; потім WebSocket з Durable Object, а цей клієнт
// лишиться запасним.

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyTyping, startPolling, useTyping } from "@/lib/realtime/client";
import { createStore } from "@/lib/store";
import { encodeCursor } from "./cursor";
import { statusOfError, type SendResult } from "./send-result";
import type { ChatMessageDto, ConversationDto } from "./types";

const POLL_MS = 3500;

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
};

export const openConversation = async (performerId: string) => (await call<{ conversation: { id: string } }>("/api/conversations", { method: "POST", body: JSON.stringify({ performerId }) })).conversation.id;

/** Сторінка повідомлень: `hasMore` каже, чи є старіші (змістовне для першої сторінки й для `fetchEarlierMessages`). */
export type MessagesResponse = { role: "customer" | "performer"; messages: ChatMessageDto[]; hasMore: boolean };

export const fetchMessages = async (conversationId: string, since = 0) => call<MessagesResponse>(`/api/conversations/${conversationId}/messages?since=${since}`);

/** Сторінка старіших за повідомлення `oldest` («Показати раніше»). */
export const fetchEarlierMessages = async (conversationId: string, oldest: Pick<ChatMessageDto, "id" | "at">) =>
  call<MessagesResponse>(`/api/conversations/${conversationId}/messages?before=${encodeURIComponent(encodeCursor(oldest))}`);

export const postMessage = async (conversationId: string, text: string, attachmentIds: string[] = []) =>
  (await call<{ message: ChatMessageDto }>(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text, attachmentIds }) })).message;

/** Людина бачить стрічку: сервер ставить її мітку прочитання на «зараз». */
export const markConversationRead = async (conversationId: string) => {
  await call<{ ok: true }>(`/api/conversations/${conversationId}/read`, { method: "POST" });
};

/** Фото в розмову: тіло — стиснутий файл. Повертає id для attachmentIds і адресу для превʼю. */
export const uploadChatPhoto = async (conversationId: string, blob: Blob) => {
  const response = await fetch(`/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { "content-type": blob.type }, body: blob });
  const data = (await response.json()) as { id?: string; url?: string; detail?: string };
  if (!response.ok || !data.id || !data.url) throw new Error(data.detail ?? "Фото не завантажилось");
  return { id: data.id, url: data.url };
};

/** Список розмов, який уже завантажило вікно повідомлень: інші місця (картки пропозицій) читають його, а не питають сервер ще раз. */
export const conversationsStore = createStore<ConversationDto[]>([]);

export const fetchConversations = async () => (await call<{ conversations: ConversationDto[] }>("/api/conversations")).conversations;

/** Репліка в тому вигляді, як її малює чат: me — це я, them — співрозмовник. */
export interface ChatLine {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
  /** system — подія в стрічці, малюється по центру без бульбашки. */
  kind?: "text" | "system";
  /** Id угоди чи запиту, про який службовий рядок. */
  contextId?: string;
  photos?: string[];
}

export const toLines = (messages: ChatMessageDto[], myRole: "customer" | "performer"): ChatLine[] =>
  messages.map((message) => ({ id: message.id, from: message.from === myRole ? "me" : "them", text: message.text, at: message.at, ...(message.kind === "system" ? { kind: "system" as const } : {}), ...(message.contextId ? { contextId: message.contextId } : {}), ...(message.attachments?.length ? { photos: message.attachments.map((item) => item.url) } : {}) }));

/**
 * Розмова з виконавцем-акаунтом: знаходить або створює її, опитує нові
 * повідомлення, дописує відправлені. `enabled` вимикає все для демо-виконавців.
 */
export const useRemoteChat = (performerId: string, enabled: boolean, seed?: ChatLine, existing?: { id: string; role: "customer" | "performer" }) => {
  const [lines, setLines] = useState<ChatLine[]>(seed ? [seed] : []);
  const [error, setError] = useState(false);
  /** Перше завантаження відбулось (успішно чи ні): до цього показуємо індикатор, а не порожню стрічку. */
  const [loaded, setLoaded] = useState(Boolean(seed));
  const [conversationId, setConversationId] = useState<string | null>(existing?.id ?? null);
  /** Старіші за те, що вже в стрічці, є на сервері: показуємо «Показати раніше». */
  const [hasMore, setHasMore] = useState(false);
  const [earlier, setEarlier] = useState<"idle" | "loading" | "error">("idle");
  /** Найстаріше повідомлення, яке вже отримано з сервера: від нього рахується наступна сторінка. */
  const oldestRef = useRef<ChatMessageDto | null>(null);
  // Розмову можна передати готовою (вхідні виконавця), інакше знайдемо чи створимо за виконавцем.
  const conversationRef = useRef<string | null>(existing?.id ?? null);
  const sinceRef = useRef(0);
  const roleRef = useRef<"customer" | "performer">(existing?.role ?? "customer");
  /** Замок від подвійного натискання: стан оновиться лише з наступним рендером. */
  const earlierBusy = useRef(false);

  const merge = useCallback((fresh: ChatLine[]) => {
    if (fresh.length === 0) return;
    setLines((current) => {
      const known = new Set(current.map((line) => line.id));
      return [...current, ...fresh.filter((line) => !known.has(line.id))];
    });
  }, []);

  const pull = useCallback(async () => {
    const id = conversationRef.current;
    if (!id) return;
    const firstPage = sinceRef.current === 0;
    const { role, messages, hasMore: more } = await fetchMessages(id, sinceRef.current);
    roleRef.current = role;
    // Прапорець «є старіші» й межу сторінки бере лише перше завантаження: опитування від мітки про них нічого не знає.
    if (firstPage) {
      setHasMore(more);
      oldestRef.current = messages[0] ?? null;
    }
    if (messages.length) {
      sinceRef.current = Math.max(sinceRef.current, ...messages.map((message) => Date.parse(message.at)));
      merge(toLines(messages, role));
    }
  }, [merge]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        if (!conversationRef.current) {
          conversationRef.current = await openConversation(performerId);
          if (!cancelled) setConversationId(conversationRef.current);
        }
        await pull();
        if (!cancelled) setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void tick();
    // Подія «message» перечитує одразу, опитування лишається запасним.
    const stop = startPolling(() => void tick(), POLL_MS, ["message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, performerId, pull]);

  const send = useCallback(
    async (text: string, attachmentIds: string[] = []): Promise<SendResult> => {
      try {
        if (!conversationRef.current) {
          conversationRef.current = await openConversation(performerId);
          setConversationId(conversationRef.current);
        }
        const message = await postMessage(conversationRef.current, text, attachmentIds);
        // Мітку `since` не рухаємо: чуже повідомлення з меншим часом, яке ще не забрали, інакше загубилось би.
        // Своє повернеться з наступним опитуванням, а merge відсікає дубль за id.
        merge(toLines([message], roleRef.current));
        return { ok: true };
      } catch (failure) {
        // Невдала відправка не «немає звʼязку»: опитування тут ні до чого, помилку показує той, хто викликав.
        return { ok: false, status: statusOfError(failure) };
      }
    },
    [merge, performerId],
  );

  /** «Показати раніше»: старіша сторінка стає на початок стрічки; `since` і дописування нових це не чіпає. */
  const loadEarlier = useCallback(async () => {
    const id = conversationRef.current;
    const oldest = oldestRef.current;
    if (!id || !oldest || earlierBusy.current) return;
    earlierBusy.current = true;
    setEarlier("loading");
    try {
      const page = await fetchEarlierMessages(id, oldest);
      oldestRef.current = page.messages[0] ?? oldest;
      setLines((current) => {
        const known = new Set(current.map((line) => line.id));
        return [...toLines(page.messages, roleRef.current).filter((line) => !known.has(line.id)), ...current];
      });
      setHasMore(page.hasMore);
      setEarlier("idle");
    } catch {
      setEarlier("error");
    } finally {
      earlierBusy.current = false;
    }
  }, []);

  const typing = useTyping(conversationId);
  /** Вызывать при наборі в полі: друга сторона побачить «друкує…». */
  const onType = useCallback(() => notifyTyping(conversationRef.current), []);

  return { lines, send, error, typing, onType, conversationId, loaded, hasMore, earlier, loadEarlier };
};
