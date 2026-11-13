"use client";

// components/placement/use-placement-flow.ts
//
// Логіка «Стати на карту»: вибір рівня, ціна доплати, оплата через monobank, історія платежів. Перенесено з
// компонента без змін поведінки; розмітка в `placement-panel.tsx` і `parts/`.

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { usePerformers } from "@/lib/map/performers";
import type { PlacementTier } from "@/lib/map/types";
import { loadPlacement, placementStore, startPlacementPayment } from "@/lib/placement/client";
import { MAX_PAYMENT, MIN_PAYMENT, TIER_FLOOR, tierFor } from "@/lib/placement/pricing";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

export namespace PlacementFlowTypes {
  export type Step = "choose" | "checkout" | "processing" | "failed";
}

export const usePlacementFlow = () => {
  const placement = useStore(placementStore);
  const performers = usePerformers();
  const total = placement?.total ?? 0;
  const prices = placement?.prices ?? TIER_FLOOR;
  const current = placement?.tier ?? tierFor(total, prices);
  const [selected, setSelected] = useState<PlacementTier>(6);
  const [step, setStep] = useState<PlacementFlowTypes.Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Ціни залежать від інших, тож перед вибором беремо свіжі.
  useEffect(() => {
    void loadPlacement();
    track(EVENTS.placementOpened);
  }, []);

  const others = useMemo(() => performers.filter((person) => !person.mine), [performers]);
  const needed = (tier: PlacementTier) => (tier < 2 ? 0 : Math.min(MAX_PAYMENT, Math.max(MIN_PAYMENT, prices[tier as keyof typeof prices] - total)));
  const amount = needed(selected);
  const tierAfter = tierFor(total + amount, prices);

  // Повернулися назад зі сторінки банку (кнопка «Назад» у браузері): кнопка оплати знову жива.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStep("checkout");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const pay = async () => {
    setStep("processing");
    setError(null);
    try {
      const { pageUrl } = await startPlacementPayment(amount);
      window.location.assign(pageUrl);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося створити рахунок.");
      setStep("failed");
    }
  };

  const select = (tier: PlacementTier) => {
    track(EVENTS.placementTierSelected, { tier, price: needed(tier) });
    setSelected(tier);
  };

  return { placement, others, current, selected, select, step, setStep, error, history, setHistory, agreed, setAgreed, needed, amount, tierAfter, pay };
};

export type PlacementFlow = ReturnType<typeof usePlacementFlow>;
