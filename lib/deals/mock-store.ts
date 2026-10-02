// lib/deals/mock-store.ts
//
// Угоди в пам'яті сервера, поки немає D1 (таблиці deals, deal_stages) і
// Monobank. Виконавець «відповідає» за таймером (lib/deals/machine.ts), а
// стан доводиться до «зараз» при кожному читанні.

import { applyAction, createDeal, simulate, validateDraft } from "./machine";
import type { Deal, DealAction, DealDraft } from "./types";

const store = globalThis as typeof globalThis & { __vmDeals?: Map<string, Deal[]> };
const all = (): Map<string, Deal[]> => (store.__vmDeals ??= new Map());

const read = (userId: string, now: number): Deal[] => {
  const advanced = (all().get(userId) ?? []).map((deal) => simulate(deal, now));
  all().set(userId, advanced);
  return advanced;
};

export const listDeals = (userId: string, requestId?: string, now = Date.now()): Deal[] =>
  read(userId, now).filter((deal) => !requestId || deal.requestId === requestId);

export const proposeDeal = (userId: string, draft: DealDraft, now = Date.now()): Deal | string => {
  const error = validateDraft(draft);
  if (error) return error;
  const deals = read(userId, now);
  // На один відгук одна жива угода: нову можна після відмови чи скасування.
  if (deals.some((deal) => deal.responseId === draft.responseId && deal.status !== "declined" && deal.status !== "cancelled")) {
    return "З цим виконавцем уже є угода.";
  }
  const deal = createDeal(`deal_${crypto.randomUUID().slice(0, 8)}`, draft, now);
  all().set(userId, [deal, ...deals]);
  return deal;
};

export const actOnDeal = (userId: string, id: string, action: DealAction, stageId: string | undefined, now = Date.now()): Deal | string | null => {
  const deals = read(userId, now);
  const deal = deals.find((item) => item.id === id);
  if (!deal) return null;
  const result = applyAction(deal, action, stageId, now);
  if (typeof result === "string") return result;
  all().set(userId, deals.map((item) => (item.id === id ? result : item)));
  return result;
};
