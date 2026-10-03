"use client";

// lib/requests/side-panel.ts
//
// Права колонка одна на двох ролей: замовник бачить пропозиції на свій
// запит, виконавець — запити під свої теги. Хто і те, і те, перемикає. За
// замовчуванням: є відкритий запит — пропозиції, інакше стрічка виконавця.

import { profileStore } from "@/lib/profile/client";
import { offersCollapsedStore, offersViewStore, offersWideStore, useActiveRequest } from "@/lib/requests/offers";
import { createStore, useStore } from "@/lib/store";

export type SidePanelKind = "offers" | "feed";

/** Що людина вибрала сама; null — вирішує вміст. */
export const sidePanelChoice = createStore<SidePanelKind | null>(null);
/** Стрічка згорнута в язичок (на телефоні — шторка опущена). */
export const feedCollapsedStore = createStore(false);

export const useIsPerformer = () => {
  const state = useStore(profileStore);
  return state.status === "ready" && Boolean(state.profile?.published);
};

/** Яка панель праворуч зараз і чи є друга, на яку можна перемкнутися. */
export const useSidePanel = () => {
  const request = useActiveRequest();
  const performer = useIsPerformer();
  const choice = useStore(sidePanelChoice);
  const hasOffers = request?.status === "open";
  const kind: SidePanelKind | null =
    choice === "offers" && hasOffers ? "offers" : choice === "feed" && performer ? "feed" : hasOffers ? "offers" : performer ? "feed" : null;
  return { kind, canSwitch: hasOffers && performer };
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
