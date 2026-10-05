"use client";

// lib/chat/client.ts
//
// Живий чат із виконавцем-акаунтом через /api/conversations. Реальний час —
// опитування `?since=`; потім WebSocket з Durable Object, а цей клієнт
// лишиться запасним.

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyTyping, startPolling, useTyping } from "@/lib/realtime/client";
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

export const fetchMessages = async (conversationId: string, since = 0) => call<{ role: "customer" | "performer"; messages: ChatMessageDto[] }>(`/api/conversations/${conversationId}/messages?since=${since}`);

export const postMessage = async (conversationId: string, text: string) => (await call<{ message: ChatMessageDto }>(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) })).message;

export const fetchConversations = async () => (await call<{ conversations: ConversationDto[] }>("/api/conversations")).conversations;

/** Репліка в тому вигляді, як її малює чат: me — це я, them — співрозмовник. */
export interface ChatLine {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
}

export const toLines = (messages: ChatMessageDto[], myRole: "customer" | "performer"): ChatLine[] =>
  messages.map((message) => ({ id: message.id, from: message.from === myRole ? "me" : "them", text: message.text, at: message.at }));

/**
 * Розмова з виконавцем-акаунтом: знаходить або створює її, опитує нові
 * повідомлення, дописує відправлені. `enabled` вимикає все для демо-виконавців.
 */
export const useRemoteChat = (performerId: string, enabled: boolean, seed?: ChatLine, existing?: { id: string; role: "customer" | "performer" }) => {
  const [lines, setLines] = useState<ChatLine[]>(seed ? [seed] : []);
  const [error, setError] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(existing?.id ?? null);
  // Розмову можна передати готовою (вхідні виконавця), інакше знайдемо чи створимо за виконавцем.
  const conversationRef = useRef<string | null>(existing?.id ?? null);
  const sinceRef = useRef(0);
  const roleRef = useRef<"customer" | "performer">(existing?.role ?? "customer");

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
    const { role, messages } = await fetchMessages(id, sinceRef.current);
    roleRef.current = role;
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
    async (text: string) => {
      try {
        if (!conversationRef.current) {
          conversationRef.current = await openConversation(performerId);
          setConversationId(conversationRef.current);
        }
        const message = await postMessage(conversationRef.current, text);
        sinceRef.current = Math.max(sinceRef.current, Date.parse(message.at));
        merge(toLines([message], roleRef.current));
        setError(false);
      } catch {
        setError(true);
      }
    },
    [merge, performerId],
  );

  const typing = useTyping(conversationId);
  /** Вызывать при наборі в полі: друга сторона побачить «друкує…». */
  const onType = useCallback(() => notifyTyping(conversationRef.current), []);

  return { lines, send, error, typing, onType };
};
