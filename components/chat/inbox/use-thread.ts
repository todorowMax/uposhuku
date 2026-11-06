"use client";

// components/chat/inbox/use-thread.ts
//
// Логіка відкритої розмови: стрічка, чернетка й фото, угоди пари та шари над чатом (шторка вибору угоди,
// шторка «+», екрани угоди й умов). Шторка не відкриває екран: вона закривається, і лише потім відкривається екран.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRemoteChat } from "@/lib/chat/client";
import type { ConversationDto } from "@/lib/chat/types";
import { afterLayerHistory } from "@/lib/ui/use-layer-history";
import { offersMapStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";
import { usePhotoStaging } from "./use-photo-staging";
import { useThreadDeals } from "./use-thread-deals";

/** Шторки над чатом: вибір угоди з кількох і меню «+». */
export type ThreadSheet = "deals" | "attach";
/** Екрани над чатом: деталі угоди, умови з розмови, пропозиція за відгуком. */
export type ThreadScreen = { kind: "deal"; id: string } | { kind: "terms" } | { kind: "composer" };

export const useThread = (conversation: ConversationDto) => {
  // Відгук цього виконавця на відкритий запит замовника: від нього рахується угода.
  const offers = useStore(offersMapStore);
  const response = conversation.role === "customer" ? offers.responses.find((item) => item.performerId === conversation.performerId) : undefined;
  const chat = useRemoteChat(conversation.performerId, true, undefined, { id: conversation.id, role: conversation.role });
  const dealState = useThreadDeals(conversation);
  const staging = usePhotoStaging(conversation.id);
  const [draft, setDraft] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ThreadSheet | null>(null);
  const [screen, setScreen] = useState<ThreadScreen | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const cancelOpening = () => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.lines.length]);

  useEffect(() => cancelOpening, []);

  /** Закриває шторку чи екран і відкриває інший екран, коли попередній шар уже пішов з історії браузера (вона рухається асинхронно). */
  const openScreenAfterClose = (next: ThreadScreen) => {
    setSheet(null);
    setScreen(null);
    cancelOpening();
    // Кадр потому: ефект закритого шару (запис в історії) встигає відпрацювати до того, як ми питаємо про історію.
    frame.current = requestAnimationFrame(() => {
      timer.current = setTimeout(() => afterLayerHistory(() => setScreen(next)), 0);
    });
  };

  /** Рядок угоди: одна угода відкривається одразу, кілька — шторкою зі списком. */
  const openDeals = () => {
    if (dealState.deals.length > 1) return setSheet("deals");
    const only = dealState.deals[0];
    if (only) return setScreen({ kind: "deal", id: only.id });
    setScreen(response ? { kind: "composer" } : { kind: "terms" });
  };

  const canSend = (draft.trim().length > 0 || staging.ready.length > 0) && !staging.uploading;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    void chat.send(
      draft.trim(),
      staging.ready.map((photo) => photo.id as string),
    );
    setDraft("");
    staging.clearPhotos();
  };

  const type = (value: string) => {
    setDraft(value);
    chat.onType();
  };

  const attachPhoto = () => {
    setSheet(null);
    staging.fileRef.current?.click();
  };

  /** Екран закрито: якщо фокус нікуди не повернувся (екран відкрито зі шторки), ставимо його на рядок угоди. */
  const closeScreen = (open: boolean) => {
    if (open) return;
    setScreen(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) rowRef.current?.focus();
    });
  };

  const selectedDeal = screen?.kind === "deal" ? dealState.deals.find((deal) => deal.id === screen.id) : undefined;

  return {
    chat,
    response,
    draft,
    type,
    submit,
    canSend,
    listRef,
    rowRef,
    closeScreen,
    viewer,
    setViewer,
    sheet,
    setSheet,
    screen,
    setScreen,
    selectedDeal,
    openDeals,
    openScreenAfterClose,
    attachPhoto,
    photos: staging.photos,
    photoError: staging.photoError,
    fileRef: staging.fileRef,
    addFiles: staging.addFiles,
    removePhoto: staging.removePhoto,
    ...dealState,
  };
};
