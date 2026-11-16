"use client";

// components/chat/inbox/use-feed-scroll.ts
//
// Прокрутка стрічки й живий регіон: донизу лише якщо людина вже внизу (або це її власне повідомлення), інакше
// плашка «Нові повідомлення». `aria-live` вмикається після першого завантаження, щоб читалась лише нова мова, а не
// вся історія. Коли зверху підвантажуються старіші повідомлення (`holdPosition` перед запитом), позиція зберігається:
// висота виросла на N пікселів, прокрутка зсувається на стільки ж, а живий регіон на цей час мовчить.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatLine } from "@/lib/chat/client";
import { isNearBottom, scrollTopAfterPrepend } from "@/lib/chat/feed";

export const useFeedScroll = (lines: ChatLine[], loaded: boolean, earlierLoading = false) => {
  const listRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const [live, setLive] = useState(false);
  /** Старіші повідомлення вставляються зверху: їх не зачитують, тож регіон тихий, доки вставка не закінчилась. */
  const [quiet, setQuiet] = useState(false);
  /** Висота й позиція стрічки на мить натискання «Показати раніше»; порожнє, коли підвантаження не чекаємо. */
  const anchor = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const firstId = lines[0]?.id;
  const last = lines.at(-1);
  const lastId = last?.id;
  const lastMine = last?.from === "me";

  const toBottom = () => {
    stuck.current = true;
    setUnseen(false);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  };

  /** Викликати перед запитом старіших повідомлень: запам'ятовує, де людина була. */
  const holdPosition = () => {
    const box = listRef.current;
    if (!box) return;
    anchor.current = { scrollHeight: box.scrollHeight, scrollTop: box.scrollTop };
    setQuiet(true);
  };

  const onScroll = () => {
    if (!listRef.current) return;
    stuck.current = isNearBottom(listRef.current);
    if (stuck.current) setUnseen(false);
  };

  // Після вставки зверху (або невдалої спроби) повертаємо позицію до того самого повідомлення. Фокус, що був на кнопці,
  // яка зникла, переходить на стрічку, а не губиться на body.
  useLayoutEffect(() => {
    const box = listRef.current;
    const held = anchor.current;
    if (!box || !held || earlierLoading) return;
    anchor.current = null;
    box.scrollTop = scrollTopAfterPrepend(held, box.scrollHeight);
    if (document.activeElement === document.body) box.focus({ preventScroll: true });
    // Кадр потому: вставлене вже в DOM, тож регіон його не зачитає.
    setTimeout(() => setQuiet(false), 0);
  }, [firstId, earlierLoading]);

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

  return { listRef, onScroll, unseen, live: live && !quiet, toBottom, holdPosition };
};
