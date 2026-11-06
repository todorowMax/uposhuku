"use client";

// components/chat/inbox/use-thread-deals.ts
//
// Угоди цієї розмови для рядка угоди й екрана угоди: одне опитування на обидві ролі (замовник бачить свої угоди
// з цією людиною, виконавець — запропоновані йому). Після дії угоду кладемо в список, не чекаючи опитування.

import { useCallback, useEffect, useState } from "react";
import { fetchPartyDeals } from "@/lib/deals/client";
import { isLive } from "@/lib/deals/summary";
import type { Deal } from "@/lib/deals/types";
import { startPolling } from "@/lib/realtime/client";

const POLL_MS = 4000;

export const useThreadDeals = (conversation: { id: string; performerId: string; role: "customer" | "performer" }) => {
  const { id, performerId, role } = conversation;
  const [deals, setDeals] = useState<Deal[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      return await fetchPartyDeals({ id, performerId, role });
    } catch {
      return null;
    }
  }, [id, performerId, role]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void load().then((list) => {
        if (cancelled) return;
        if (list) setDeals(list);
        setReady(true);
      });
    };
    refresh();
    const stop = startPolling(refresh, POLL_MS, ["deal", "message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [load]);

  /** Угода змінилась після дії: оновлюємо її в списку, закриті прибираємо. */
  const apply = useCallback((deal: Deal) => {
    setDeals((current) => {
      const has = current.some((item) => item.id === deal.id);
      const next = has ? current.map((item) => (item.id === deal.id ? deal : item)) : [deal, ...current];
      return next.filter(isLive);
    });
  }, []);

  const reload = useCallback(() => {
    void load().then((list) => list && setDeals(list));
  }, [load]);

  return { deals, ready, apply, reload };
};
