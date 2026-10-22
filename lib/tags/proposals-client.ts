"use client";

// lib/tags/proposals-client.ts
//
// Пропозиції тегів у браузері: «Запропонувати „…“», коли пошук нічого не
// знайшов, і чипи «на розгляді», доки ми не додали тег у словник.

import { useEffect } from "react";
import { createStore, useStore } from "@/lib/store";

export type ProposalContext = "profile" | "work" | "request";

export interface PendingProposal {
  id: string;
  text: string;
  context: ProposalContext;
  entityId: string;
}

/** Результат «Запропонувати» для пікера. */
export type ProposeOutcome = { kind: "proposed"; proposal: PendingProposal } | { kind: "existing"; tagId: string } | { kind: "error"; message: string };

const store = createStore<PendingProposal[]>([]);
let loading: Promise<void> | null = null;

const problemMessage = async (response: Response, fallback: string): Promise<string> => {
  const data = (await response.json().catch(() => null)) as { detail?: string; title?: string } | null;
  return data?.detail ?? data?.title ?? fallback;
};

/** Один раз за життя сторінки: мої пропозиції, що на розгляді. */
export const loadProposals = (): Promise<void> =>
  (loading ??= (async () => {
    try {
      const response = await fetch("/api/tags/proposals", { cache: "no-store" });
      if (!response.ok) return;
      const { proposals } = (await response.json()) as { proposals: PendingProposal[] };
      store.set(proposals);
    } catch {
      // Мережа моргнула: чипів «на розгляді» не буде, решта працює.
      loading = null;
    }
  })());

export const proposeTag = async (text: string, context: ProposalContext, entityId = ""): Promise<ProposeOutcome> => {
  let response: Response;
  try {
    response = await fetch("/api/tags/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, context, entityId }) });
  } catch {
    return { kind: "error", message: "Немає зв'язку. Перевірте інтернет і спробуйте ще раз." };
  }
  if (!response.ok) return { kind: "error", message: await problemMessage(response, "Не вдалося запропонувати тег.") };
  const data = (await response.json()) as { existing?: string; proposal?: { id: string; text: string } };
  if (data.existing) return { kind: "existing", tagId: data.existing };
  const proposal: PendingProposal = { id: data.proposal?.id ?? "", text: data.proposal?.text ?? text, context, entityId };
  store.set([...store.get().filter((item) => !(item.id === proposal.id && item.context === context && item.entityId === entityId)), proposal]);
  return { kind: "proposed", proposal };
};

export const removeProposal = async (proposal: PendingProposal): Promise<void> => {
  // Спершу з екрана: людина передумала, чекати відповіді сервера їй нема чого.
  store.set(store.get().filter((item) => !(item.id === proposal.id && item.context === proposal.context && item.entityId === proposal.entityId)));
  try {
    await fetch(`/api/tags/proposals/${encodeURIComponent(proposal.id)}?context=${proposal.context}&entityId=${encodeURIComponent(proposal.entityId)}`, { method: "DELETE" });
  } catch {
    // Не вдалося: пропозиція лишиться на сервері, нічого страшного.
  }
};

/** Пропозиції одного місця (профіль, одна робота) й дії над ними. */
export const useProposals = (context: ProposalContext, entityId = "") => {
  const all = useStore(store);
  useEffect(() => {
    void loadProposals();
  }, []);
  return {
    items: all.filter((item) => item.context === context && item.entityId === entityId),
    propose: (text: string) => proposeTag(text, context, entityId),
    remove: removeProposal,
  };
};
