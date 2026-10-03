// lib/requests/direct-chat.ts
//
// Особистий чат із виконавцем, який відкривається з його профілю
// («Описати задачу»). Перше повідомлення — задача, вона висить угорі, поки
// виконавець не відповів. З виконавцем-акаунтом (me-…) переписка йде через
// сервер (/api/conversations, опитування раз на кілька секунд); з
// демо-виконавцем лежить у цьому браузері, і він «відповідає» сам.

import { useEffect } from "react";
import { fetchConversations, fetchMessages, isRemotePerformer, openConversation, postMessage, toLines } from "@/lib/chat/client";
import { sessionStore } from "@/lib/auth/client";
import { useStore, createStore } from "@/lib/store";
import type { ChatMessage } from "./mock-chat";

export interface DirectDialog {
  performerId: string;
  /** Усі повідомлення; перше — задача замовника. */
  messages: ChatMessage[];
  /** waiting — чекаємо першу відповідь виконавця. */
  status: "waiting" | "answered";
}

const KEY = "vm:dm";
const PENDING_KEY = "vm:dm-pending";

export const dialogsStore = createStore<Record<string, DirectDialog>>({});
/** Виконавець друкує (лише в пам'яті). */
export const typingStore = createStore<Record<string, boolean>>({});
/** Чат у профілі цього виконавця треба відкрити одразу, як тільки профіль з'явиться. */
export const directChatOpenStore = createStore<string | null>(null);

const REPLIES = [
  "Дякую, що написали! Бачу вашу задачу. Відповім докладніше сьогодні.",
  "Можу показати схожі роботи: надішлю посилання прямо сюди.",
  "Щоб точніше оцінити, підкажіть, будь ласка, до якої дати потрібно?",
  "Добре, тоді зафіксуємо ціну й етапи тут, у чаті, коли будете готові.",
];

const timers = new Map<string, number[]>();

const persist = () => {
  try {
    // Серверні розмови в браузері не зберігаємо: правда лежить у D1.
    const local = Object.fromEntries(Object.entries(dialogsStore.get()).filter(([id]) => !isRemotePerformer(id)));
    window.localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    // Без сховища переписка житиме до перезавантаження.
  }
};

const write = (dialog: DirectDialog) => {
  dialogsStore.set({ ...dialogsStore.get(), [dialog.performerId]: dialog });
  persist();
};

const scheduleReply = (performerId: string) => {
  const list = timers.get(performerId) ?? [];
  list.push(window.setTimeout(() => typingStore.set({ ...typingStore.get(), [performerId]: true }), 900));
  list.push(
    window.setTimeout(() => {
      typingStore.set({ ...typingStore.get(), [performerId]: false });
      const dialog = dialogsStore.get()[performerId];
      if (!dialog) return;
      const mine = dialog.messages.filter((message) => message.from === "me").length;
      write({
        ...dialog,
        status: "answered",
        messages: [...dialog.messages, { id: crypto.randomUUID(), from: "them", text: REPLIES[(mine - 1) % REPLIES.length], at: new Date().toISOString() }],
      });
    }, 3200),
  );
  timers.set(performerId, list);
};

let hydrated = false;

/** Підтягнути збережені чати з браузера (один раз). */
export const hydrateDialogs = () => {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, DirectDialog>;
    dialogsStore.set(saved);
    // Закрили вкладку, поки виконавець «думав»: нехай відповість зараз.
    for (const dialog of Object.values(saved)) if (dialog.status === "waiting") scheduleReply(dialog.performerId);
  } catch {
    // Зіпсований запис ігноруємо.
  }
};

export const useDialog = (performerId: string) => useStore(dialogsStore)[performerId] ?? null;
export const useTyping = (performerId: string) => Boolean(useStore(typingStore)[performerId]);

// ───────────── розмови з виконавцями-акаунтами ─────────────

const conversationIds = new Map<string, string>();

/** Підтягнути розмову з сервера в сховище. Немає розмови — нічого не робимо. */
export const syncRemoteDialog = async (performerId: string) => {
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
    write({
      performerId,
      messages: lines.map((line) => ({ id: line.id, from: line.from, text: line.text, at: line.at })),
      status: lines.some((line) => line.from === "them") ? "answered" : "waiting",
    });
  } catch {
    // Немає зв'язку: покажемо, що вже є, і спробуємо на наступному кроці.
  }
};

const sendRemote = async (performerId: string, text: string) => {
  try {
    let id = conversationIds.get(performerId);
    if (!id) {
      id = await openConversation(performerId);
      conversationIds.set(performerId, id);
    }
    await postMessage(id, text);
    await syncRemoteDialog(performerId);
  } catch {
    // Не відправилось: людина побачить, що повідомлення не з'явилось, і спробує ще раз.
  }
};

/** Поки відкрите вікно чату з виконавцем-акаунтом, питаємо сервер про нові повідомлення. */
export const useRemoteDialogSync = (performerId: string, active: boolean) => {
  const session = useStore(sessionStore);
  const signedIn = session.status === "user";
  useEffect(() => {
    if (!active || !signedIn || !isRemotePerformer(performerId)) return;
    void syncRemoteDialog(performerId);
    const timer = window.setInterval(() => void syncRemoteDialog(performerId), 3500);
    return () => window.clearInterval(timer);
  }, [active, signedIn, performerId]);
};

/** Новий чат: задача стає першим повідомленням. Якщо чат уже є, задача дописується до нього. */
export const startDialog = (performerId: string, text: string) => {
  if (isRemotePerformer(performerId)) {
    void sendRemote(performerId, text);
    return;
  }
  const existing = dialogsStore.get()[performerId];
  const message: ChatMessage = { id: crypto.randomUUID(), from: "me", text, at: new Date().toISOString() };
  write(existing ? { ...existing, messages: [...existing.messages, message] } : { performerId, messages: [message], status: "waiting" });
  if (!existing || existing.status === "waiting") scheduleReply(performerId);
};

export const sendDirect = (performerId: string, text: string) => {
  if (isRemotePerformer(performerId)) {
    void sendRemote(performerId, text);
    return;
  }
  const dialog = dialogsStore.get()[performerId];
  if (!dialog) return;
  write({ ...dialog, messages: [...dialog.messages, { id: crypto.randomUUID(), from: "me", text, at: new Date().toISOString() }] });
  scheduleReply(performerId);
};

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

export const hasPending = () => {
  try {
    return window.localStorage.getItem(PENDING_KEY) !== null;
  } catch {
    return false;
  }
};
