"use client";

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { isProfilePath, useCloseProfileThen, useRunAfterProfileClose } from "@/lib/profile/navigation";
import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { startDialog, takePending } from "@/lib/requests/direct-chat";
import { useStore } from "@/lib/store";

/**
 * Гість написав задачу виконавцю в профілі й пішов входити. Щойно він увійшов (з пошти чи з Google), надсилаємо його
 * задачу й відкриваємо розмову. Профіль, з якого він пішов, закриваємо: чат не стоїть поверх профілю, що лишився б під ним.
 * Тут же виконується відкладене «закрити профіль і відкрити чат» (`useCloseProfileThen`), бо цей компонент живе в шаблоні карти.
 */
export function DirectChatSync() {
  const session = useStore(sessionStore);
  const closeProfileThen = useCloseProfileThen();
  useRunAfterProfileClose();

  useEffect(() => {
    if (session.status !== "user") return;
    const pending = takePending();
    if (!pending) return;
    if (pending.text) startDialog(pending.performerId, pending.text);
    const openChat = () => inboxOpenStore.set({ conversationId: null, performerId: pending.performerId });
    if (isProfilePath(window.location.pathname)) closeProfileThen(openChat);
    else openChat();
  }, [session.status, closeProfileThen]);

  return null;
}
