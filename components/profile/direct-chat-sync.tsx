"use client";

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { useOpenProfile } from "@/lib/profile/navigation";
import { inboxOpenStore } from "@/components/chat/inbox-panel";
import { startDialog, takePending } from "@/lib/requests/direct-chat";
import { useStore } from "@/lib/store";

/**
 * Гість написав задачу виконавцю й пішов входити. Щойно він увійшов (з пошти
 * чи з Google), повертаємо його в профіль і відкриваємо розмову в месенджері.
 */
export function DirectChatSync() {
  const session = useStore(sessionStore);
  const openProfile = useOpenProfile();

  useEffect(() => {
    if (session.status !== "user") return;
    const pending = takePending();
    if (!pending) return;
    if (pending.text) startDialog(pending.performerId, pending.text);
    openProfile(pending.performerId);
    inboxOpenStore.set({ conversationId: null, performerId: pending.performerId });
  }, [session.status, openProfile]);

  return null;
}
