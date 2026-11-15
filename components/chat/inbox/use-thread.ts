"use client";

// components/chat/inbox/use-thread.ts
//
// Логіка відкритої розмови: стрічка, чернетка й фото, угоди пари та шари над чатом (шторка вибору угоди,
// шторка «+», екрани угоди й умов). Шторка не відкриває екран: вона закривається, і лише потім відкривається екран.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRemoteChat } from "@/lib/chat/client";
import { draftAfterSend, sendErrorText } from "@/lib/chat/send-result";
import type { ConversationDto } from "@/lib/chat/types";
import { afterLayerHistory } from "@/lib/ui/use-layer-history";
import { offersMapStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";
import { useReadMark } from "./use-read-mark";
import { usePhotoStaging } from "./use-photo-staging";
import { useProposeIntent } from "./use-propose-intent";
import { useThreadDeals } from "./use-thread-deals";

/** Шторки над чатом: вибір угоди з кількох і меню «+». */
export type ThreadSheet = "deals" | "attach";
/** Екрани над чатом: деталі угоди, умови з розмови, пропозиція за відгуком. */
export type ThreadScreen = { kind: "deal"; id: string } | { kind: "terms" } | { kind: "composer" };

export const useThread = (conversation: ConversationDto, onRead: (conversationId: string) => void) => {
  // Відгук цього виконавця на відкритий запит замовника: від нього рахується угода.
  const offers = useStore(offersMapStore);
  const response = conversation.role === "customer" ? offers.responses.find((item) => item.performerId === conversation.performerId) : undefined;
  const chat = useRemoteChat(conversation.performerId, true, undefined, { id: conversation.id, role: conversation.role });
  useReadMark({ conversationId: conversation.id, ready: chat.loaded && !chat.error, version: chat.lines.at(-1)?.id ?? "", onRead });
  const dealState = useThreadDeals(conversation);
  const staging = usePhotoStaging(conversation.id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Замок від подвійної відправки: стан оновиться лише з наступним рендером, а Enter може прийти раніше. */
  const sendingRef = useRef(false);
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

  useProposeIntent(conversation.performerId, dealState.ready, openDeals);

  const canSend = (draft.trim().length > 0 || staging.ready.length > 0) && !staging.uploading && !sending;

  /** Поле й фото чистяться лише після успіху: при відмові текст і фото лишаються, а людина бачить причину. */
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    const submitted = draft;
    const result = await chat.send(
      submitted.trim(),
      staging.ready.map((photo) => photo.id as string),
    );
    sendingRef.current = false;
    setSending(false);
    if (!result.ok) return setSendError(sendErrorText(result.status));
    staging.clearPhotos();
    setDraft((current) => draftAfterSend(current, submitted));
  };

  const type = (value: string) => {
    setSendError(null);
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
    sendError,
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
