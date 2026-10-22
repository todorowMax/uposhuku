"use client";

import { useEffect, useRef } from "react";
import { notificationSettingsStore } from "@/components/account/notification-settings";
import { inboxOpenStore } from "@/components/chat/inbox-panel";
import { authFlowStore, activeRequestStore, requestsStore, sessionStore } from "@/lib/auth/client";
import { mapSelectedRequest, setMapMode } from "@/lib/feed/map-requests";
import { profileStore } from "@/lib/profile/client";
import { offersCollapsedStore, offersViewStore } from "@/lib/requests/offers";
import { feedCollapsedStore } from "@/lib/requests/side-panel";
import { useStore } from "@/lib/store";

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
 * Гостя спершу ведемо у вхід і після входу відкриваємо те, що просили.
 */
export function DeepLinkSync() {
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  const profile = useStore(profileStore);
  const pending = useRef<string | null>(null);

  // Один раз читаємо адресу й забуваємо параметр.
  useEffect(() => {
    const url = new URL(window.location.href);
    const open = url.searchParams.get("open");
    if (!open) return;
    pending.current = open;
    url.searchParams.delete("open");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const open = pending.current;
    if (!open || session.status === "loading") return;
    if (session.status === "guest") {
      authFlowStore.set({ mode: "login" });
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
      if (profile.status === "loading") return;
      setMapMode("requests");
      mapSelectedRequest.set(id);
      feedCollapsedStore.set(false);
    }
    pending.current = null;
  }, [session.status, requests, profile.status]);

  return null;
}
