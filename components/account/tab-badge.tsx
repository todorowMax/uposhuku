"use client";

import { useEffect, useRef } from "react";
import { feedPendingStore } from "@/lib/feed/client";
import { dealsStore } from "@/lib/deals/client";
import { needsAction } from "@/lib/deals/machine";
import { loadPrefs, notifyUser } from "@/lib/notifications";
import { offersPendingStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";

const BASE = typeof document === "undefined" ? "" : document.title;

/**
 * Лічильник у заголовку вкладки й сповіщення браузера: нові пропозиції,
 * нові запити для виконавця й угоди, що чекають дії. Людина, що перейшла в
 * іншу вкладку, не пропустить відповідь.
 */
export function TabBadge() {
  const offers = useStore(offersPendingStore);
  const feed = useStore(feedPendingStore);
  const deals = useStore(dealsStore);
  const todo = Object.values(deals).flat().filter((deal) => needsAction(deal)).length;
  const total = offers + feed + todo;
  const previous = useRef({ offers: 0, feed: 0, todo: 0 });
  const base = useRef(BASE);

  useEffect(() => loadPrefs(), []);

  useEffect(() => {
    if (!base.current) base.current = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = total > 0 ? `(${total}) ${base.current}` : base.current;
  }, [total]);

  useEffect(() => {
    const last = previous.current;
    if (offers > last.offers) notifyUser("Нова пропозиція", `Виконавці відповіли на ваш запит: ще ${offers - last.offers}.`);
    if (feed > last.feed) notifyUser("Новий запит для вас", `Під ваші теги з'явилось запитів: ${feed - last.feed}.`);
    if (todo > last.todo) notifyUser("Угода чекає на вас", "Потрібна ваша дія в чаті з виконавцем.");
    previous.current = { offers, feed, todo };
  }, [offers, feed, todo]);

  return null;
}
