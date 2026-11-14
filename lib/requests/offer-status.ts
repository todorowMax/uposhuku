// lib/requests/offer-status.ts
//
// Що з пропозицією виконавця зараз: ще нічого, відкрито чат чи вже є угода. Від цього залежать
// мітка й кнопки картки: «Написати» або «Відкрити чат», «Відхилити» ховається, коли є угода.
// Чиста функція: розмови й угоди вже завантажені (список розмов тримає вікно повідомлень, угоди запиту DealSync).

import type { ConversationDto } from "@/lib/chat/types";
import { dealState, liveDeal } from "@/lib/deals/summary";
import type { Deal } from "@/lib/deals/types";
import type { OfferResponse } from "./types";

export type OfferStatus =
  | { kind: "new" }
  | { kind: "chat" }
  | { kind: "deal"; /** «Угода #A1B2 · В роботі». */ label: string };

export const offerStatus = (offer: Pick<OfferResponse, "id" | "performerId">, deals: Deal[], conversations: ConversationDto[]): OfferStatus => {
  const conversation = conversations.find((item) => item.role === "customer" && item.performerId === offer.performerId);
  // Розмова з'являється вже з рядка «Відгук на…»: «чат відкрито» лише коли хтось писав сам.
  const deal = liveDeal(deals, offer.id);
  if (deal) return { kind: "deal", label: `Угода ${deal.number} · ${dealState(deal, "customer")}` };
  return conversation?.talked ? { kind: "chat" } : { kind: "new" };
};
