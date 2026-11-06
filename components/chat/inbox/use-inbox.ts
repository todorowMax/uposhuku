"use client";

// components/chat/inbox/use-inbox.ts
//
// Логіка вікна «Повідомлення»: список розмов (опитування раз на кілька секунд), відкрита розмова, фільтр,
// запит відкрити з посилання Telegram чи профілю. Рух вікна — use-inbox-motion.ts.

import { useEffect, useState } from "react";
import { sessionStore } from "@/lib/auth/client";
import { fetchConversations, openConversation } from "@/lib/chat/client";
import type { ConversationDto } from "@/lib/chat/types";
import { startPolling } from "@/lib/realtime/client";
import { useStore } from "@/lib/store";
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
  const signedIn = session.status === "user";
  const motion = useInboxMotion(open, setOpen);
  useKeyboardInset(motion.panelRef, open);
  // Системне «назад» закриває чат і лишає на карті.
  useLayerHistory(open, motion.close);

  useEffect(() => {
    if (!signedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- після виходу з акаунта чистимо список і закриваємо вікно
      setItems([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      void fetchConversations()
        .then((list) => !cancelled && setItems(list))
        .catch(() => {});
    };
    load();
    const stop = startPolling(load, POLL_MS, ["message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [signedIn, open]);

  // Посилання з Telegram: відкриваємо список чи конкретну розмову, щойно вони завантажились.
  useEffect(() => {
    if (!requested?.performerId || !signedIn) return;
    const performerId = requested.performerId;
    inboxOpenStore.set(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- відкриваємо вікно у відповідь на запит зі сховища (посилання Telegram, профіль)
    setOpen(true);
    void openConversation(performerId)
      .then(async (id) => {
        const list = await fetchConversations();
        setItems(list);
        const target = list.find((item) => item.id === id);
        if (target) setActive(target);
      })
      .catch(() => {});
  }, [requested, signedIn]);

  useEffect(() => {
    if (!requested || requested.performerId || !signedIn || items.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- відкриваємо вікно у відповідь на запит зі сховища, щойно є список розмов
    setOpen(true);
    const target = requested.conversationId ? items.find((item) => item.id === requested.conversationId) : null;
    if (target) setActive(target);
    inboxOpenStore.set(null);
  }, [requested, signedIn, items]);

  // Бейдж: розмови, де щось чекає на мене (угода), а якщо таких немає, то де я виконавець.
  const actionCount = items.filter((item) => item.deal?.needsMe).length || items.filter((item) => item.role === "performer").length;

  return { ...motion, signedIn, items, open, setOpen, active, setActive, filter, setFilter, actionCount };
};
