"use client";

import { useEffect, useRef } from "react";
import { notificationSettingsStore } from "@/components/account/notification-settings";
import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { authFlowStore, activeRequestStore, requestsStore, sessionStore } from "@/lib/auth/client";
import { mapSelectedRequest, setMapMode } from "@/lib/feed/map-requests";
import { deepLinkNext, requestLinkStep } from "@/lib/map/deep-link";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { offersCollapsedStore, offersViewStore } from "@/lib/requests/offers";
import { feedCollapsedStore } from "@/lib/requests/side-panel";
import { useStore } from "@/lib/store";

/**
 * `request:<id>` для того, хто вже увійшов. `false`: посилання ще не виконано (профіль вантажиться або людина його створює),
 * чекаємо наступного разу. Редактор профілю відкриваємо один раз.
 */
const openRequestLink = (id: string, profile: Parameters<typeof requestLinkStep>[0], editorAsked: { current: boolean }): boolean => {
  const step = requestLinkStep(profile);
  if (step === "create-profile" && !editorAsked.current) {
    editorAsked.current = true;
    profileEditorStore.set(true);
  }
  if (step !== "open") return false;
  setMapMode("requests");
  mapSelectedRequest.set(id);
  feedCollapsedStore.set(false);
  return true;
};

/**
 * Посилання з Telegram ведуть на `/?open=…`: відкриваємо потрібну панель і
 * прибираємо параметр з адреси.
 *
 *   settings        налаштування сповіщень
 *   inbox           «Повідомлення»
 *   chat:<id>       розмова
 *   offers:<id>     пропозиції на мій запит
 *   request:<id>    запит у стрічці виконавця
 *
 * Гостя спершу ведемо у вхід і після входу відкриваємо те, що просили (вхід через Google повертає на те саме посилання).
 * Хто увійшов без опублікованого профілю виконавця, для `request:` бачить редактор профілю, а запит відкривається
 * після публікації профілю. Сюди ж ведуть кнопка «Відгукнутися» зі сторінки запиту /zapyt/<id> і кнопка в Telegram-каналі.
 */
export function DeepLinkSync() {
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  const profile = useStore(profileStore);
  const pending = useRef<string | null>(null);
  const editorAsked = useRef(false);
  const published = profile.status === "ready" && Boolean(profile.profile?.published);

  // Один раз читаємо адресу й забуваємо параметр.
  useEffect(() => {
    const url = new URL(window.location.href);
    const open = url.searchParams.get("open");
    if (!open) return;
    pending.current = open;
    url.searchParams.delete("open");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const open = pending.current;
    if (!open || session.status === "loading") return;
    if (session.status === "guest") {
      authFlowStore.set({ mode: "login", next: deepLinkNext(open) });
      return;
    }
    const [kind, id = ""] = open.split(/:(.*)/s);

    if (kind === "settings") notificationSettingsStore.set(true);
    else if (kind === "inbox") inboxOpenStore.set({ conversationId: null });
    else if (kind === "chat") inboxOpenStore.set({ conversationId: id });
    else if (kind === "offers") {
      // Дані запитів ще вантажаться: чекаємо, щоб не відкрити панель порожньою.
      if (requests === null) return;
      if (requests.some((request) => request.id === id)) {
        activeRequestStore.set(id);
        offersViewStore.set({ kind: "list" });
        offersCollapsedStore.set(false);
      }
    } else if (kind === "request") {
      if (!openRequestLink(id, { status: profile.status, published }, editorAsked)) return;
    }
    pending.current = null;
  }, [session.status, requests, profile.status, published]);

  return null;
}
