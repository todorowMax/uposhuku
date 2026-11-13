// tests/helpers/account-fixtures.ts
//
// Заготовки для тестів видалення акаунта: угода з потрібним станом етапів і «багатий» акаунт, у якого є рядок
// майже в кожній таблиці, де зустрічається користувач.

import { createDeal } from "@/lib/deals/machine";
import type { Deal, DealMethod, StageStatus } from "@/lib/deals/types";
import { deals, dealComplaints, dealPayments } from "@/db/schema";
import { getDb } from "@/lib/server/db";

export interface SeedDeal {
  id: string;
  owner: string;
  /** Користувач-виконавець (id угоди стає me-<id>). */
  performer: string;
  method?: DealMethod;
  status?: Deal["status"];
  stages?: StageStatus[];
  escrow?: boolean;
  updatedAt?: number;
}

/** Кладе угоду прямо в базу з потрібним станом, повз машину станів. */
export const seedDeal = async (input: SeedDeal): Promise<Deal> => {
  const { id, owner, performer, method = "direct", status = "accepted", stages = ["pending"], escrow = false, updatedAt = Date.now() } = input;
  const base = createDeal(id, { requestId: `direct:conv-${id}`, responseId: "direct", performer: { id: `me-${performer}`, name: `Імʼя ${performer}`, photo: `/api/uploads/photos/${performer}/a.jpg`, avatarIndex: 1, specialty: "Дизайн", fop: false }, method, stages: stages.map(() => ({ title: "Етап", amount: 500, days: 3 })), title: "Логотип" }, updatedAt);
  const deal: Deal = { ...base, status, number: `#${id.slice(-4).toUpperCase()}`, stages: base.stages.map((stage, index) => ({ ...stage, status: stages[index], ...(escrow ? { escrow: { address: "0xabc", client: "0xdef" } } : {}) })) };
  await getDb().insert(deals).values({ id, ownerUserId: owner, requestId: deal.requestId, responseId: deal.responseId, performerId: deal.performer.id, status, data: JSON.stringify(deal), createdAt: updatedAt, updatedAt });
  return deal;
};

export const seedComplaint = async (dealId: string, userId: string, status: "open" | "closed" = "open") => {
  await getDb().insert(dealComplaints).values({ id: `cmp_${dealId}_${status}`, dealId, stageId: `${dealId}-s1`, complainantUserId: userId, side: "customer", reason: "other", text: "Скарга", status, createdAt: 1, closedAt: status === "closed" ? 2 : null });
};

export const seedBankInvoice = async (dealId: string, status: string) => {
  await getDb().insert(dealPayments).values({ id: `pay_${dealId}`, dealId, stageId: `${dealId}-s1`, provider: "monobank", invoiceId: `inv_${dealId}`, status, card: "any", amount: 50000, pageUrl: "https://pay.test", basket: "[]", createdAt: 1, updatedAt: 1 });
};
