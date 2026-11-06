"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useActiveRequest } from "@/lib/requests/offers";
import { useSidePanel } from "@/lib/requests/side-panel";

// Бокові панелі вантажимо, коли вони потрібні: пропозиції з'являються з відкритим запитом,
// стрічка в режимі «Запити» для виконавця. До того їхній код не входить у перше завантаження.
const loadOffers = () => import("@/components/requests/offers-panel").then((module) => module.OffersPanel);
const loadFeed = () => import("@/components/requests/feed-panel").then((module) => module.FeedPanel);
const OffersPanel = dynamic(loadOffers, { ssr: false });
const FeedPanel = dynamic(loadFeed, { ssr: false });

/** Пропозиції живуть і тоді, коли праворуч стрічка: вони рахують нові відгуки, доки запит відкритий. */
export const OffersPanelGate = () => {
  const request = useActiveRequest();
  return request?.status === "open" ? <OffersPanel /> : null;
};

export const FeedPanelGate = () => {
  const { kind } = useSidePanel();
  return kind === "feed" ? <FeedPanel /> : null;
};

const PRELOAD = [loadOffers, loadFeed, () => import("@/components/profile/profile-editor"), () => import("@/components/placement/placement-panel")];

/** Коли сторінка вільна, підтягуємо код панелей: відкриття тоді не чекає мережі. */
export const PanelPreload = () => {
  useEffect(() => {
    const run = () => PRELOAD.forEach((load) => void load());
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 2000);
    return () => window.clearTimeout(id);
  }, []);
  return null;
};
