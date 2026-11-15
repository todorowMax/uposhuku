"use client";

// components/chat/inbox/use-feed-scroll.ts
//
// Прокрутка стрічки й живий регіон: донизу лише якщо людина вже внизу (або це її власне повідомлення), інакше
// плашка «Нові повідомлення». `aria-live` вмикається після першого завантаження, щоб читалась лише нова мова, а не
// вся історія.

import { useEffect, useRef, useState } from "react";
import type { ChatLine } from "@/lib/chat/client";
import { isNearBottom } from "@/lib/chat/feed";

export const useFeedScroll = (lines: ChatLine[], loaded: boolean) => {
  const listRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const [live, setLive] = useState(false);
  const last = lines.at(-1);
  const lastId = last?.id;
  const lastMine = last?.from === "me";

  const toBottom = () => {
    stuck.current = true;
    setUnseen(false);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  };

  const onScroll = () => {
    if (!listRef.current) return;
    stuck.current = isNearBottom(listRef.current);
    if (stuck.current) setUnseen(false);
  };

  useEffect(() => {
    if (!lastId) return;
    if (stuck.current || lastMine) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    else setUnseen(true);
  }, [lastId, lastMine]);

  useEffect(() => {
    if (!loaded) return;
    // Кадр потому: історія вже намальована з `aria-live="off"`, тож її не зачитають; нове прийде вже в живий регіон.
    const timer = setTimeout(() => setLive(true), 0);
    return () => clearTimeout(timer);
  }, [loaded]);

  return { listRef, onScroll, unseen, live, toBottom };
};
