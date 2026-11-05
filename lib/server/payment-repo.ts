// lib/server/payment-repo.ts
//
// Платежі етапів безпечної угоди й рахунки виконавців на D1. Сума, корзина й
// статус лежать окремо від документа угоди (deal-repo): угоду рухає машина
// станів, а платіж відбиває те, що каже провайдер. Усі суми в копійках.

import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
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
  modifiedDate: string | null;
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
    modifiedDate: null,
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

/** Префікс тимчасового invoiceId, поки рахунок у банку ще не створено. */
export const PENDING_INVOICE_PREFIX = "pending:";

/**
 * Резервує платіж етапу ДО виклику банку. Частковий унікальний індекс (deal_payments_live_stage_idx) пускає
 * лише один живий платіж на етап, тож другий одночасний запит отримує null і не створює другого рахунку.
 * Його id іде в `reference` рахунку: якщо відповідь банку загубиться, вебхук знайде платіж за ним.
 */
export const reserveDealPayment = async (input: Omit<NewDealPayment, "invoiceId" | "pageUrl">, now = Date.now()): Promise<DealPayment | null> => {
  const id = `pay_${crypto.randomUUID().slice(0, 8)}`;
  const row = {
    id,
    dealId: input.dealId,
    stageId: input.stageId,
    provider: input.provider,
    invoiceId: `${PENDING_INVOICE_PREFIX}${id}`,
    status: "creating",
    card: input.card,
    amount: input.amount,
    finalAmount: null,
    pageUrl: "",
    basket: JSON.stringify(input.basket),
    modifiedDate: null,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await getDb().insert(dealPayments).values(row).onConflictDoNothing().returning({ id: dealPayments.id });
  return inserted.length > 0 ? parsePayment(row) : null;
};

/** Банк створив рахунок: записуємо його id й сторінку оплати. */
export const attachInvoice = async (id: string, invoice: { invoiceId: string; pageUrl: string }, now = Date.now()): Promise<void> => {
  await getDb().update(dealPayments).set({ invoiceId: invoice.invoiceId, pageUrl: invoice.pageUrl, status: "created", updatedAt: now }).where(and(eq(dealPayments.id, id), eq(dealPayments.status, "creating")));
};

/** Банк однозначно відмовив у створенні рахунку: звільняємо етап для нової спроби. */
export const abandonReservation = async (id: string, now = Date.now()): Promise<void> => {
  await getDb().update(dealPayments).set({ status: "failure", updatedAt: now }).where(and(eq(dealPayments.id, id), eq(dealPayments.status, "creating")));
};

export const getPayment = async (id: string): Promise<DealPayment | null> => {
  const [row] = await getDb().select().from(dealPayments).where(eq(dealPayments.id, id)).limit(1);
  return row ? parsePayment(row) : null;
};

/**
 * Приймає знімок банку, лише якщо він новіший за збережений (порівнюємо рядки modifiedDate банку, вони
 * однакового ISO-формату) або з тією ж міткою, але іншим статусом (банк має секундну точність). Старіший знімок
 * нічого не міняє: запізнілий вебхук не відкотить статус.
 * true, якщо запис оновлено.
 */
export const acceptBankSnapshot = async (id: string, snapshot: { status: string; modifiedDate: string; finalAmount?: number }, now = Date.now()): Promise<boolean> => {
  const updated = await getDb()
    .update(dealPayments)
    .set({ status: snapshot.status, modifiedDate: snapshot.modifiedDate, ...(snapshot.finalAmount !== undefined ? { finalAmount: snapshot.finalAmount } : {}), updatedAt: now })
    .where(and(eq(dealPayments.id, id), or(isNull(dealPayments.modifiedDate), lt(dealPayments.modifiedDate, snapshot.modifiedDate), and(eq(dealPayments.modifiedDate, snapshot.modifiedDate), ne(dealPayments.status, snapshot.status)))))
    .returning({ id: dealPayments.id });
  return updated.length > 0;
};

/** Платіж за нашим id, який ми передали банку в `reference`: запасний шлях, якщо id рахунку ми не встигли записати. */
export const findPaymentByReference = async (reference: string): Promise<DealPayment | null> => {
  const payment = reference.startsWith("pay_") ? await getPayment(reference) : null;
  return payment && payment.invoiceId.startsWith(PENDING_INVOICE_PREFIX) ? payment : null;
};

/** Вписує справжній id рахунку в платіж, чий запис створення не закінчився (відповідь банку загубилась). */
export const adoptInvoice = async (id: string, invoiceId: string, now = Date.now()): Promise<void> => {
  await getDb()
    .update(dealPayments)
    .set({ invoiceId, status: "created", updatedAt: now })
    .where(and(eq(dealPayments.id, id), inArray(dealPayments.status, ["creating", "failure"])));
};

/** Платежі, які ще можуть змінитися: звіряємо з банком. Найдавніше перевірені першими (updatedAt піднімає `touchPayment`). */
export const listOpenPayments = async (limit: number): Promise<DealPayment[]> =>
  (
    await getDb()
      .select()
      .from(dealPayments)
      .where(inArray(dealPayments.status, ["creating", "created", "processing", "hold"]))
      .orderBy(asc(dealPayments.updatedAt))
      .limit(limit)
  ).map(parsePayment);

/** Позначає, що платіж щойно перевірено, щоб інші платежі стали в чергу. */
export const touchPayment = async (id: string, now = Date.now()): Promise<void> => {
  await getDb().update(dealPayments).set({ updatedAt: now }).where(eq(dealPayments.id, id));
};

/** Найновіший платіж етапу, який ще може спрацювати: невдалі, прострочені й повернені не рахуємо. */
export const activeStagePayment = async (dealId: string, stageId: string): Promise<DealPayment | null> => {
  const rows = await getDb()
    .select()
    .from(dealPayments)
    .where(and(eq(dealPayments.dealId, dealId), eq(dealPayments.stageId, stageId), ne(dealPayments.status, "failure"), ne(dealPayments.status, "expired"), ne(dealPayments.status, "reversed")))
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
