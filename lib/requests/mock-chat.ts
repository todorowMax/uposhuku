// lib/requests/mock-chat.ts
//
// Чат із виконавцем, поки немає Durable Objects: переписка лежить у цьому
// браузері, а виконавець «відповідає» сам за кілька секунд. Перше
// повідомлення — текст його відгуку. Справжній чат — WebSocket з Durable
// Object переписки, історія в D1.

import { useEffect, useRef, useState } from "react";
import type { OfferResponse } from "./types";

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
}

const REPLIES = [
  "Дякую, що написали! Так, можу почати вже завтра.",
  "Можу показати схожі роботи — надішлю посилання прямо сюди.",
  "Щоб точніше оцінити, підкажіть, будь ласка, до якої дати потрібно?",
  "Добре, тоді зафіксуємо ціну й етапи тут, у чаті, коли будете готові.",
];

const key = (responseId: string) => `vm:chat:${responseId}`;

const load = (response: OfferResponse): ChatMessage[] => {
  try {
    const raw = window.localStorage.getItem(key(response.id));
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch {
    // Без сховища — починаємо з відгуку.
  }
  return [{ id: `${response.id}-offer`, from: "them", text: response.message, at: response.createdAt }];
};

/**
 * Контакти поза чатом не блокуємо, а попереджаємо (вирішено в плані):
 * номер телефону, @нік, посилання на месенджери.
 */
export const mentionsContacts = (text: string) =>
  /(\+?\d[\d\s\-()]{8,}\d)|(^|\s)@[a-z0-9_]{4,}|t\.me\/|wa\.me\/|viber|telegram|телеграм|вайбер|whatsapp|ватсап/i.test(text);

export const useMockChat = (response: OfferResponse) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(response));
  const [typing, setTyping] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key(response.id), JSON.stringify(messages));
    } catch {
      // Переписка житиме до перезавантаження.
    }
  }, [messages, response.id]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const send = (text: string) => {
    const mine = messages.filter((message) => message.from === "me").length;
    setMessages((current) => [...current, { id: crypto.randomUUID(), from: "me", text, at: new Date().toISOString() }]);
    // Виконавець «друкує» і відповідає; на кожне наше — одна відповідь по черзі.
    timers.current.push(window.setTimeout(() => setTyping(true), 700));
    timers.current.push(
      window.setTimeout(() => {
        setTyping(false);
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), from: "them", text: REPLIES[mine % REPLIES.length], at: new Date().toISOString() },
        ]);
      }, 2400)
    );
  };

  return { messages, typing, send };
};
