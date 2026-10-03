// lib/requests/direct-chat.ts
//
// Особистий чат із виконавцем, який відкривається з його профілю
// («Описати задачу»). Перше повідомлення — задача, вона висить угорі, поки
// виконавець не відповів. Переписка йде через сервер (/api/conversations,
// опитування раз на кілька секунд); тут її копія для вікна чату.

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { fetchConversations, fetchMessages, openConversation, postMessage, toLines } from "@/lib/chat/client";
import { startPolling } from "@/lib/realtime/client";
import { createStore, useStore } from "@/lib/store";

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
}

export interface DirectDialog {
  performerId: string;
  /** Усі повідомлення; перше — задача замовника. */
  messages: ChatMessage[];
  /** waiting — чекаємо першу відповідь виконавця. */
  status: "waiting" | "answered";
}

const PENDING_KEY = "vm:dm-pending";

export const dialogsStore = createStore<Record<string, DirectDialog>>({});
/** Чат у профілі цього виконавця треба відкрити одразу, як тільки профіль з'явиться. */
export const directChatOpenStore = createStore<string | null>(null);

const conversationIds = new Map<string, string>();

/** Підтягнути розмову з сервера в сховище. Немає розмови — нічого не робимо. */
export const syncDialog = async (performerId: string) => {
  try {
    let id = conversationIds.get(performerId);
    if (!id) {
      id = (await fetchConversations()).find((item) => item.performerId === performerId && item.role === "customer")?.id;
      if (!id) return;
      conversationIds.set(performerId, id);
    }
    const { role, messages } = await fetchMessages(id, 0);
    if (messages.length === 0) return;
    const lines = toLines(messages, role);
    dialogsStore.set({
      ...dialogsStore.get(),
      [performerId]: { performerId, messages: lines.map((line) => ({ id: line.id, from: line.from, text: line.text, at: line.at })), status: lines.some((line) => line.from === "them") ? "answered" : "waiting" },
    });
  } catch {
    // Немає зв'язку: покажемо, що вже є, і спробуємо на наступному кроці.
  }
};

const send = async (performerId: string, text: string) => {
  try {
    let id = conversationIds.get(performerId);
    if (!id) {
      id = await openConversation(performerId);
      conversationIds.set(performerId, id);
    }
    await postMessage(id, text);
    await syncDialog(performerId);
  } catch {
    // Не відправилось: людина побачить, що повідомлення не з'явилось, і спробує ще раз.
  }
};

/** Поки відкрите вікно чату з виконавцем, питаємо сервер про нові повідомлення. */
export const useDialogSync = (performerId: string, active: boolean) => {
  const session = useStore(sessionStore);
  const signedIn = session.status === "user";
  useEffect(() => {
    if (!active || !signedIn) return;
    void syncDialog(performerId);
    return startPolling(() => void syncDialog(performerId), 3500, ["message"]);
  }, [active, signedIn, performerId]);
};

export const useDialog = (performerId: string) => useStore(dialogsStore)[performerId] ?? null;

/** Новий чат: задача стає першим повідомленням. Якщо чат уже є, задача дописується до нього. */
export const startDialog = (performerId: string, text: string) => void send(performerId, text);

export const sendDirect = (performerId: string, text: string) => void send(performerId, text);

/** Гість написав задачу й іде входити: тримаємо її, поки не повернеться. */
export const savePending = (performerId: string, text: string) => {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ performerId, text }));
  } catch {
    // Без сховища задачу доведеться написати ще раз.
  }
};

export const takePending = (): { performerId: string; text: string } | null => {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as { performerId: string; text: string };
  } catch {
    return null;
  }
};
