// lib/server/payment-repo.ts
//
// Платежі етапів безпечної угоди й рахунки виконавців на D1. Сума, корзина й
// статус лежать окремо від документа угоди (deal-repo): угоду рухає машина
// станів, а платіж відбиває те, що каже провайдер. Усі суми в копійках.

import { and, desc, eq, ne } from "drizzle-orm";
import { dealPayments, paymentEvents, payoutAccounts } from "@/db/schema";
import type { BasketItem } from "@/lib/deals/basket";
import type { CardKind } from "@/lib/deals/types";
import { getDb } from "./db";

export type PaymentProvider = "monobank" | "uapay";

export interface DealPayment {
  id: string;
  dealId: string;
  stageId: string;
  provider: PaymentProvider;
  invoiceId: string;
  status: string;
  card: CardKind;
  amount: number;
  finalAmount: number | null;
  pageUrl: string;
  basket: BasketItem[];
  createdAt: number;
  updatedAt: number;
}

const parsePayment = (row: typeof dealPayments.$inferSelect): DealPayment => ({
  ...row,
  provider: row.provider as PaymentProvider,
  card: row.card as CardKind,
  basket: JSON.parse(row.basket) as BasketItem[],
});

export interface NewDealPayment {
  dealId: string;
  stageId: string;
  provider: PaymentProvider;
  invoiceId: string;
  card: CardKind;
  amount: number;
  pageUrl: string;
  basket: BasketItem[];
}

/** Записує рахунок, який створили в провайдера. Початковий статус «created»: далі його змінює вебхук. */
export const createDealPayment = async (input: NewDealPayment, now = Date.now()): Promise<DealPayment> => {
  const row = {
    id: `pay_${crypto.randomUUID().slice(0, 8)}`,
    dealId: input.dealId,
    stageId: input.stageId,
    provider: input.provider,
    invoiceId: input.invoiceId,
    status: "created",
    card: input.card,
    amount: input.amount,
    finalAmount: null,
    pageUrl: input.pageUrl,
    basket: JSON.stringify(input.basket),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(dealPayments).values(row);
  return parsePayment(row);
};

export const findPaymentByInvoice = async (provider: PaymentProvider, invoiceId: string): Promise<DealPayment | null> => {
  const [row] = await getDb()
    .select()
    .from(dealPayments)
    .where(and(eq(dealPayments.provider, provider), eq(dealPayments.invoiceId, invoiceId)))
    .limit(1);
  return row ? parsePayment(row) : null;
};

/** Найновіший платіж етапу, який ще може спрацювати: невдалі й прострочені не рахуємо. */
export const activeStagePayment = async (dealId: string, stageId: string): Promise<DealPayment | null> => {
  const rows = await getDb()
    .select()
    .from(dealPayments)
    .where(and(eq(dealPayments.dealId, dealId), eq(dealPayments.stageId, stageId), ne(dealPayments.status, "failure"), ne(dealPayments.status, "expired")))
    .orderBy(desc(dealPayments.createdAt))
    .limit(1);
  return rows[0] ? parsePayment(rows[0]) : null;
};

/** Фіксує подію вебхука. true, якщо вона нова; false, якщо її вже обробляли (банк повторює непідтверджене). */
export const recordPaymentEvent = async (provider: PaymentProvider, eventId: string, now = Date.now()): Promise<boolean> => {
  const inserted = await getDb().insert(paymentEvents).values({ id: eventId, provider, createdAt: now }).onConflictDoNothing().returning({ id: paymentEvents.id });
  return inserted.length > 0;
};

/** Забуває подію, щоб провайдер міг повторити її після нашої помилки обробки. */
export const forgetPaymentEvent = async (eventId: string): Promise<void> => {
  await getDb().delete(paymentEvents).where(eq(paymentEvents.id, eventId));
};

export interface PaymentUpdate {
  id: string;
  status: string;
  finalAmount?: number;
}

export const updatePayment = async (update: PaymentUpdate, now = Date.now()): Promise<void> => {
  await getDb()
    .update(dealPayments)
    .set({ status: update.status, ...(update.finalAmount !== undefined ? { finalAmount: update.finalAmount } : {}), updatedAt: now })
    .where(eq(dealPayments.id, update.id));
};

export type PayoutStatus = "pending" | "active" | "rejected";

export interface PayoutAccount {
  userId: string;
  provider: PaymentProvider;
  taxId: string | null;
  receiverId: string | null;
  status: PayoutStatus;
}

export const getPayoutAccount = async (userId: string, provider: PaymentProvider): Promise<PayoutAccount | null> => {
  const [row] = await getDb()
    .select()
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.userId, userId), eq(payoutAccounts.provider, provider)))
    .limit(1);
  return row ? { userId: row.userId, provider, taxId: row.taxId, receiverId: row.receiverId, status: row.status as PayoutStatus } : null;
};

/** Створює чи оновлює рахунок виконавця в провайдера: один запис на користувача й провайдера. */
export const savePayoutAccount = async (account: PayoutAccount, now = Date.now()): Promise<void> => {
  const values = { taxId: account.taxId, receiverId: account.receiverId, status: account.status, updatedAt: now };
  await getDb()
    .insert(payoutAccounts)
    .values({ id: `pa_${crypto.randomUUID().slice(0, 8)}`, userId: account.userId, provider: account.provider, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [payoutAccounts.userId, payoutAccounts.provider], set: values });
};
