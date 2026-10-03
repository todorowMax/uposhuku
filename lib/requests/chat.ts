"use client";

// lib/requests/chat.ts
//
// Чат у панелі пропозицій: переписка з виконавцем іде через сервер
// (/api/conversations). Перше повідомлення — текст його відгуку на запит.

import { useRemoteChat } from "@/lib/chat/client";
import type { OfferResponse } from "./types";

export const useChat = (response: OfferResponse) => {
  const live = useRemoteChat(response.performerId, true, { id: `${response.id}-offer`, from: "them", text: response.message, at: response.createdAt });
  return { messages: live.lines, typing: false, send: (text: string) => void live.send(text), error: live.error };
};
