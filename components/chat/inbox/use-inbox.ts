"use client";

// components/chat/inbox/use-inbox.ts
//
// Логіка вікна «Повідомлення»: список розмов (опитування раз на кілька секунд), відкрита розмова, фільтр,
// запит відкрити з посилання Telegram чи профілю. Рух вікна — use-inbox-motion.ts.

import { useEffect, useState } from "react";
import { sessionStore } from "@/lib/auth/client";
import { conversationsStore, fetchConversations, openConversation } from "@/lib/chat/client";
import type { ConversationDto } from "@/lib/chat/types";
import { attentionCount } from "@/lib/chat/unread";
import { startPolling } from "@/lib/realtime/client";
import { useStore } from "@/lib/store";
import { chatOpenStore, panelCountStore } from "@/lib/ui/chat-window";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import { useLayerHistory } from "@/lib/ui/use-layer-history";
import { inboxOpenStore } from "./inbox-store";
import { useInboxMotion } from "./use-inbox-motion";

const POLL_MS = 8000;

export type InboxFilter = "all" | ConversationDto["phase"];

export const useInbox = () => {
  const session = useStore(sessionStore);
  const requested = useStore(inboxOpenStore);
  const [items, setItems] = useState<ConversationDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ConversationDto | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  /** Останнє опитування списку не вдалось: показуємо рядок з «Спробувати ще раз». */
  const [listError, setListError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const signedIn = session.status === "user";
  const motion = useInboxMotion(open, setOpen);
  useKeyboardInset(motion.panelRef, open);
  // Системне «назад» закриває чат і лишає на карті.
  useLayerHistory(open, motion.close);

  // Панель угоди стає поруч із чатом (lib/ui/chat-window.ts): їй треба знати, що чат відкритий, а розгорнутий чат
  // стискається, поки панель відкрита, бо поруч із вікном на 1040px для неї місця немає.
  useEffect(() => {
    chatOpenStore.set(open);
    return () => chatOpenStore.set(false);
  }, [open]);
  const panelOpen = useStore(panelCountStore) > 0;
  const { size, toggleSize } = motion;
  useEffect(() => {
    if (open && panelOpen && size === "wide") toggleSize();
  }, [open, panelOpen, size, toggleSize]);

  // Вихід з акаунта: чистимо список, відкриту розмову й закриваємо вікно. Змінюємо стан під час відтворення
  // (за зміною входу), а не в ефекті: так немає зайвого проходу з застарілим списком.
  const [wasSignedIn, setWasSignedIn] = useState(signedIn);
  if (wasSignedIn !== signedIn) {
    setWasSignedIn(signedIn);
    if (!signedIn) {
      setItems([]);
      setActive(null);
      setOpen(false);
    }
  }

  // Список розмов бачать і картки пропозицій: «Чат відкрито» без окремого запиту.
  useEffect(() => conversationsStore.set(items), [items]);

  // Запит відкрити вікно (посилання Telegram, профіль, відгук): виконуємо один раз, щойно можна, тобто
  // увійшли, а для запиту без виконавця ще й завантажився список розмов.
  const [handled, setHandled] = useState<typeof requested>(null);
  if (requested && requested !== handled && signedIn && (requested.performerId || items.length > 0)) {
    setHandled(requested);
    setOpen(true);
    const target = requested.conversationId ? items.find((item) => item.id === requested.conversationId) : null;
    if (target) setActive(target);
  }

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      void fetchConversations()
        .then((list) => {
          if (cancelled) return;
          setItems(list);
          setListError(false);
        })
        .catch(() => !cancelled && setListError(true));
    };
    load();
    const stop = startPolling(load, POLL_MS, ["message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [signedIn, open, attempt]);

  // Запит виконано: прибираємо його зі сховища (воно зовнішнє, тож тут це не стан компонента).
  useEffect(() => {
    if (handled && requested === handled) inboxOpenStore.set(null);
  }, [handled, requested]);

  // Запит «розмова з виконавцем»: створюємо чи знаходимо її й показуємо.
  useEffect(() => {
    const performerId = handled?.performerId;
    if (!performerId) return;
    let cancelled = false;
    void openConversation(performerId)
      .then(async (id) => {
        const list = await fetchConversations();
        if (cancelled) return;
        setItems(list);
        const target = list.find((item) => item.id === id);
        if (target) setActive(target);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [handled]);

  // Бейдж: розмови з непрочитаним і ті, де угода чекає на мене.
  const actionCount = attentionCount(items);

  // Відкрита розмова відмічена прочитаною: гасимо її в списку одразу, не чекаючи наступного опитування.
  const markRead = (conversationId: string) => setItems((list) => list.map((item) => (item.id === conversationId ? { ...item, unread: 0, unreadDeal: false } : item)));

  const retry = () => setAttempt((value) => value + 1);

  return { ...motion, listError, retry, signedIn, items, open, setOpen, active, setActive, filter, setFilter, actionCount, markRead };
};
