"use client";

// lib/requests/chat.ts
//
// Чат у панелі пропозицій: з виконавцем-акаунтом (me-…) переписка йде через
// сервер, з демо-виконавцем лишається заглушка в браузері.

import { isRemotePerformer, useRemoteChat } from "@/lib/chat/client";
import { useMockChat } from "./mock-chat";
import type { OfferResponse } from "./types";

export const useChat = (response: OfferResponse) => {
  const remote = isRemotePerformer(response.performerId);
  // Обидва хуки викликаємо завжди: правило хуків. Невикористаний вимкнено.
  const mock = useMockChat(response);
  const live = useRemoteChat(response.performerId, remote, { id: `${response.id}-offer`, from: "them", text: response.message, at: response.createdAt });
  if (!remote) return { messages: mock.messages, typing: mock.typing, send: mock.send, error: false };
  return { messages: live.lines, typing: false, send: (text: string) => void live.send(text), error: live.error };
};
