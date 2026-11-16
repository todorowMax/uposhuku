"use client";

// components/profile/use-profile-view.ts
//
// Логіка повного профілю виконавця (/p/[id]): хто це (з карти, з сервера або з відповіді сторінки), відгуки, підписи
// тегів, розмова з виконавцем, закриття. Перенесено з компонента без змін поведінки; розмітка в `profile-view.tsx`.

import { useEffect, useMemo, useState } from "react";
import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { authFlowStore, sessionStore } from "@/lib/auth/client";
import { CITIES } from "@/lib/map/cities";
import { usePerformers } from "@/lib/map/performers";
import { performerStats } from "@/lib/map/stats";
import type { Performer } from "@/lib/map/types";
import type { ContactBarTypes } from "@/components/profile/use-contact-bar";
import { useCloseProfile, useCloseProfileThen } from "@/lib/profile/navigation";
import { profileToPerformer } from "@/lib/profile/to-performer";
import type { Profile } from "@/lib/profile/types";
import { savePending, sendFirstMessage, useDialog, useDialogSync } from "@/lib/requests/direct-chat";
import { fetchReviews } from "@/lib/reviews/client";
import type { Review } from "@/lib/reviews/types";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";
import { openAfterLayers } from "@/lib/ui/use-layer-history";

export namespace ProfileViewTypes {
  export type Reviews = { list: Review[]; average: number | null };
}

/** Виконавець за id: з карти, а для акаунтів, яких на карті ще немає, з /api/performers. */
const useViewedPerformer = (id: string | null, initial: Performer | null) => {
  const performers = usePerformers();
  const onMap = id ? performers.find((person) => person.id === id) : undefined;
  // Відповідь сервера памʼятає, для якого id вона: зміна id сама «скидає» її, без запису в стан з ефекту.
  const [result, setResult] = useState<{ id: string; performer: Performer | null } | null>(null);
  const current = result?.id === id ? result : null;
  const remote = current?.performer ?? null;
  const failed = Boolean(current && !current.performer);

  useEffect(() => {
    if (!id || onMap || initial) return;
    let cancelled = false;
    void fetch(`/api/performers/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        return (await response.json()) as { profile: Profile; tier: number; userId: string; stats?: Performer["stats"]; online?: boolean };
      })
      .then(({ profile, tier, userId, stats, online }) => {
        if (cancelled) return;
        const performer = profileToPerformer({ ...profile, published: true, updatedAt: "" }, userId, 0, tier as Performer["tier"]);
        setResult({ id, performer: performer ? { ...performer, stats, online: Boolean(online) } : null });
      })
      .catch(() => !cancelled && setResult({ id, performer: null }));
    return () => {
      cancelled = true;
    };
  }, [id, onMap, initial]);

  return { performer: onMap ?? initial ?? remote, failed };
};

export const useProfileView = (id: string, initial: Performer | null, initialLabels: Record<string, string>) => {
  const closeRoute = useCloseProfile();
  const session = useStore(sessionStore);
  const { performer: found, failed } = useViewedPerformer(id, initial);
  const mineId = session.status === "user" ? `me-${session.user.id}` : null;
  const mine = Boolean(found && (found.mine || found.id === mineId));
  const performer = useMemo(() => (found ? { ...found, mine } : null), [found, mine]);
  // Екран закривається анімацією, а перехід на іншу адресу йде за ним, коли історія шарів улеглась.
  const [open, setOpen] = useState(true);
  const dialog = useDialog(id);
  // Чи є вже розмова з цим виконавцем-акаунтом: від цього залежить напис кнопки.
  useDialogSync(id, true);
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const [reviews, setReviews] = useState<ProfileViewTypes.Reviews | null>(null);

  useEffect(() => {
    track(EVENTS.performerProfileOpened, { from: "profile_page" });
  }, []);

  const close = () => {
    setOpen(false);
    // Ще одна мить після історії шарів: роутер Next обробляє той самий popstate і скасував би перехід, що йде просто в ньому.
    openAfterLayers(() => setTimeout(closeRoute, 0));
  };

  const closeProfileThen = useCloseProfileThen();
  /** Закрити профіль і лише потім виконати `then`: чат не відкривається поверх профілю, що лишився б під ним. */
  const closeThen = (then: () => void) => {
    setOpen(false);
    openAfterLayers(() => setTimeout(() => closeProfileThen(then), 0));
  };
  const openChatWith = () => inboxOpenStore.set({ conversationId: null, performerId: id });

  /** Розмова з цим виконавцем уже є: «Відкрити чат» закриває профіль і відкриває її. */
  const openChat = () => {
    track(EVENTS.chatOpened, { from: "profile" });
    closeThen(openChatWith);
  };

  /** Людина натиснула «Описати задачу»: кнопка стала полем. */
  const startTask = () => track(EVENTS.chatOpened, { from: "profile" });

  /**
   * Задача виконавцю з поля в профілі. Гість спершу входить (вхід відкривається над профілем, текст збережено, а після
   * входу задачу надішле DirectChatSync). Увійшов: перше повідомлення йде в розмову, далі профіль закривається й
   * відкривається чат. Не вийшло: профіль лишається, поле тримає текст.
   */
  const sendTask = async (text: string): Promise<ContactBarTypes.Outcome> => {
    if (session.status !== "user") {
      savePending(id, text);
      authFlowStore.set({ mode: "login" });
      return "login";
    }
    const result = await sendFirstMessage(id, text);
    if (result.ok) closeThen(openChatWith);
    return result;
  };

  useEffect(() => {
    let cancelled = false;
    void fetchReviews(id)
      .then(({ reviews: list, average }) => !cancelled && setReviews({ list, average }))
      .catch(() => !cancelled && setReviews({ list: [], average: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tags = useMemo(() => performer?.tags ?? [], [performer]);
  const joined = tags.join(",");
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    void import("@/lib/tags/engine").then((engine) => {
      if (!cancelled) setLabels(Object.fromEntries(joined.split(",").map((tag) => [tag, engine.tagLabel(tag)])));
    });
    return () => {
      cancelled = true;
    };
  }, [joined]);

  const stats = useMemo(() => (performer ? performerStats(performer) : null), [performer]);
  const city = performer ? CITIES.find((item) => item.id === performer.cityId)?.name : undefined;
  const proven = useMemo(() => new Set(performer?.works.flatMap((work) => work.tags ?? []) ?? []), [performer]);

  return { open, close, performer, failed, dialog: Boolean(dialog), openChat, startTask, sendTask, labels, reviews, tags, stats, city, proven };
};

export type ProfileViewState = ReturnType<typeof useProfileView>;
