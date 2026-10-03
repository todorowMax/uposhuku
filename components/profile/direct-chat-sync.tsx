"use client";

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { useOpenProfile } from "@/lib/profile/navigation";
import { directChatOpenStore, hydrateDialogs, startDialog, takePending } from "@/lib/requests/direct-chat";
import { useStore } from "@/lib/store";

/**
 * Гість написав задачу виконавцю й пішов входити. Щойно він увійшов (з пошти
 * чи з Google), створюємо чат і повертаємо його в профіль із відкритим чатом.
 */
export function DirectChatSync() {
  const session = useStore(sessionStore);
  const openProfile = useOpenProfile();

  useEffect(() => {
    hydrateDialogs();
  }, []);

  useEffect(() => {
    if (session.status !== "user") return;
    const pending = takePending();
    if (!pending) return;
    startDialog(pending.performerId, pending.text);
    directChatOpenStore.set(pending.performerId);
    openProfile(pending.performerId);
  }, [session.status, openProfile]);

  return null;
}
