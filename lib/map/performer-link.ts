// lib/map/performer-link.ts
//
// Дії для `/?open=performer:<id>` (components/map/deep-link-sync.tsx): ім'я виконавця для підказки в полі запиту й сама
// пропозиція роботи. Рішення, що саме робити, дає performerLinkStep у lib/map/deep-link.ts.

import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { proposeDealIntentStore, proposeTargetStore } from "@/lib/requests/propose-work";

/** Ім'я опублікованого виконавця; null, коли профілю немає чи мережа підвела. */
const fetchPerformerName = async (id: string): Promise<string | null> => {
  try {
    const response = await fetch(`/api/performers/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { profile?: { name?: unknown } };
    return typeof data.profile?.name === "string" && data.profile.name ? data.profile.name : null;
  } catch {
    return null;
  }
};

/** Те саме, що кнопка «Запропонувати роботу» на картці: розмова з наміром «угода» або поле запиту з підказкою. */
export const startProposeWork = async (id: string, step: "deal" | "compose"): Promise<void> => {
  if (step === "deal") {
    proposeDealIntentStore.set(id);
    inboxOpenStore.set({ conversationId: null, performerId: id });
    return;
  }
  const name = await fetchPerformerName(id);
  if (name) proposeTargetStore.set({ name });
};
