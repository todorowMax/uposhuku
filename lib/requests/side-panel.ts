"use client";

// lib/requests/side-panel.ts
//
// Права колонка відповідає режиму карти: у «Виконавцях» — пропозиції,
// у «Запитах» — запити під теги профілю.

import { profileStore } from "@/lib/profile/client";
import { allPerformersStore, mapModeStore } from "@/lib/feed/map-requests";
import { offersCollapsedStore, offersViewStore, offersWideStore, useActiveRequest } from "@/lib/requests/offers";
import { createStore, useStore } from "@/lib/store";

export type SidePanelKind = "offers" | "feed";

/** Спершу видно карту; подальший стан стрічки визначає сама людина. */
export const feedCollapsedStore = createStore(true);

export const useIsPerformer = () => {
  const state = useStore(profileStore);
  return state.status === "ready" && Boolean(state.profile?.published);
};

/** Панель праворуч визначає лише режим карти. */
export const useSidePanel = () => {
  const request = useActiveRequest();
  const mapMode = useStore(mapModeStore);
  const allPerformers = useStore(allPerformersStore);
  const performer = useIsPerformer();
  const kind: SidePanelKind | null = mapMode === "requests"
    ? performer ? "feed" : null
    : allPerformers ? null : request?.status === "open" ? "offers" : null;
  return { kind };
};

/** Права колонка розгорнута: від неї зсуваються поле запиту й фільтри. */
export const useSidePanelOpen = () => {
  const { kind } = useSidePanel();
  const offersCollapsed = useStore(offersCollapsedStore);
  const feedCollapsed = useStore(feedCollapsedStore);
  return kind === "offers" ? !offersCollapsed : kind === "feed" ? !feedCollapsed : false;
};

/** Права колонка розтягнута (чат на пів екрана): поле запиту зсувається далі. */
export const useSidePanelWide = () => {
  const { kind } = useSidePanel();
  const wide = useStore(offersWideStore);
  const view = useStore(offersViewStore);
  return kind === "offers" && wide && view.kind === "chat";
};
