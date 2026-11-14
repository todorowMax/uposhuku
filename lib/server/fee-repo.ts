// lib/server/fee-repo.ts
//
// Журнал комісії за фактом на D1 (схему й модель див. db/schema-payments.ts, lib/fees). Нарахування пише
// `accrueFees` після кожного успішного запису угоди (deal-repo: writeGuarded), оплату пише лише підтверджений
// банком success рахунку (`applyFeeInvoiceStatus`). Обидва записи ідемпотентні завдяки унікальним індексам.
// Цей файл не імпортує deal-repo: той імпортує його.

import { desc, eq, inArray } from "drizzle-orm";
import { deals, feeEntries, feeInvoices, users } from "@/db/schema";
import { accrualsFor, balanceOf, POSTPAID_FEE_BP } from "@/lib/fees/fees";
import type { FeeTypes } from "@/lib/fees/fees.types";
import { dueDateFor } from "@/lib/fees/period";
import type { Deal, DealDraft } from "@/lib/deals/types";
import type { InvoiceStatusResponse } from "@/lib/monobank/client";
import { logServer } from "@/lib/telemetry/log";
import { getDb } from "./db";
import { featureEnabledFor } from "./features";

/** Скільки останніх рядків віддає рахунок. */
const ENTRIES_LIMIT = 100;

/**
 * Ставка, яку треба записати в нову угоду замовника, або null. Лише для прямого переказу (safe і ескроу комісії за фактом не мають)
 * і лише коли прапорець `postpaid_fee` увімкнений для цього замовника.
 */
export const feeTermsFor = async (customerUserId: string, method: DealDraft["method"]): Promise<{ rateBp: number } | null> => {
  if (method !== "direct") return null;
  const [row] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, customerUserId)).limit(1);
  return (await featureEnabledFor("postpaid_fee", row?.email)) ? { rateBp: POSTPAID_FEE_BP } : null;
};

/**
 * Пише нарахування за зміну угоди before → after. Платник це власник угоди. Збій лише в журнал: дія з угодою вже
 * збережена й від нарахування не залежить; пропущене нарахування наздожене наступна зміна угоди (завершення
 * доносить усі оплачені етапи). У журнал не йдуть ні пошта, ні суми, лише id.
 */
export const accrueFees = async (input: { before: Deal | null; after: Deal; ownerUserId: string; now?: number }): Promise<void> => {
  const { before, after, ownerUserId, now = Date.now() } = input;
  const accruals = accrualsFor(before, after);
  if (accruals.length === 0) return;
  try {
    await getDb()
      .insert(feeEntries)
      .values(
        accruals.map((item) => ({
          id: `fee_${crypto.randomUUID().slice(0, 12)}`,
          userId: ownerUserId,
          kind: "accrual",
          amount: item.amountKop,
          dealId: item.dealId,
          stageId: item.stageId,
          rateBp: item.rateBp,
          baseAmount: item.baseKop,
          createdBy: "system",
          createdAt: now,
        })),
      )
      .onConflictDoNothing();
  } catch (error) {
    logServer({ level: "error", event: "fee_accrual_failed", message: error instanceof Error ? error.message : "unknown", detail: { dealId: after.id } });
  }
};

/** Короткі дані угод для рядків рахунку: номер і назви етапів. */
const dealLabels = async (dealIds: string[]): Promise<Map<string, { number: string; stages: Map<string, string> }>> => {
  if (dealIds.length === 0) return new Map();
  const rows = await getDb().select({ id: deals.id, data: deals.data }).from(deals).where(inArray(deals.id, dealIds));
  return new Map(
    rows.map((row) => {
      const deal = JSON.parse(row.data) as Deal;
      return [row.id, { number: deal.number, stages: new Map(deal.stages.map((stage) => [stage.id, stage.title])) }];
    }),
  );
};

/** Рахунок людини: баланс (з усього журналу), строк і останні рядки. */
export const feeAccount = async (userId: string, now: number): Promise<FeeTypes.Account> => {
  const db = getDb();
  // Баланс із усього журналу, а не з останніх 100 рядків: записів на людину небагато (кілька на квартал).
  const amounts = await db.select({ amountKop: feeEntries.amount }).from(feeEntries).where(eq(feeEntries.userId, userId));
  const rows = await db.select().from(feeEntries).where(eq(feeEntries.userId, userId)).orderBy(desc(feeEntries.createdAt), desc(feeEntries.id)).limit(ENTRIES_LIMIT);
  const labels = await dealLabels([...new Set(rows.flatMap((row) => (row.dealId ? [row.dealId] : [])))]);
  const entries = rows.map((row): FeeTypes.EntryView => {
    const label = row.dealId ? labels.get(row.dealId) : undefined;
    return {
      id: row.id,
      kind: row.kind as FeeTypes.EntryKind,
      amountKop: row.amount,
      createdAt: new Date(row.createdAt).toISOString(),
      dealId: row.dealId,
      dealNumber: label?.number ?? null,
      stageTitle: (row.stageId && label?.stages.get(row.stageId)) || null,
      baseKop: row.baseAmount,
      rateBp: row.rateBp,
      note: row.note,
    };
  });
  return { balanceKop: balanceOf(amounts), dueAt: dueDateFor(now), entries };
};

/** Чи є в людини хоч один запис журналу (потрібно, щоб показати рахунок, коли прапорець уже вимкнули). */
export const hasFeeEntries = async (userId: string): Promise<boolean> =>
  (await getDb().select({ id: feeEntries.id }).from(feeEntries).where(eq(feeEntries.userId, userId)).limit(1)).length > 0;

// ───────────── рахунки Monobank ─────────────

export interface FeeInvoice {
  id: string;
  userId: string;
  invoiceId: string;
  /** Копійки. */
  amount: number;
  status: string;
  createdAt: number;
}

const toInvoice = (row: typeof feeInvoices.$inferSelect): FeeInvoice => ({ id: row.id, userId: row.userId, invoiceId: row.invoiceId, amount: row.amount, status: row.status, createdAt: row.createdAt });

/** Наш id рахунку відомий до виклику банку: він іде в `reference` і в `redirectUrl`. */
export const newFeeInvoiceId = () => `fin_${crypto.randomUUID().slice(0, 8)}`;

/** Записує рахунок, який створили в банку. Початковий статус «created»: далі його міняє вебхук. */
export const createFeeInvoice = async (input: { id: string; userId: string; amountKop: number; invoiceId: string }, now = Date.now()): Promise<FeeInvoice> => {
  const row = { id: input.id, userId: input.userId, invoiceId: input.invoiceId, amount: input.amountKop, status: "created", modifiedDate: null, paidAt: null, createdAt: now };
  await getDb().insert(feeInvoices).values(row);
  return toInvoice(row);
};

/** Рахунок бачить лише його власник. */
export const getFeeInvoice = async (id: string, userId: string): Promise<FeeInvoice | null> => {
  const [row] = await getDb().select().from(feeInvoices).where(eq(feeInvoices.id, id)).limit(1);
  return row && row.userId === userId ? toInvoice(row) : null;
};

export interface AppliedFeeInvoice {
  /** true лише в тому виклику, який справді записав оплату. */
  credited: boolean;
  userId: string;
  /** Скільки зараховано, копійки (0, коли не в цей виклик). */
  amountKop: number;
}

/**
 * Застосовує статус від банку (вебхук чи звірка). null, якщо рахунок не комісійний. Подія, не новіша за збережену,
 * нічого не міняє. Оплату в журнал пише лише `success` із сумою, що збігається з нашою, на фактичну суму
 * (`finalAmount`, інакше `amount`); інші статуси лише оновлюють рахунок. Запис оплати й оновлення статусу йдуть
 * одним batch, а повтор спиняє унікальний індекс по `invoice_id`.
 */
export const applyFeeInvoiceStatus = async (status: InvoiceStatusResponse, now = Date.now()): Promise<AppliedFeeInvoice | null> => {
  const db = getDb();
  const [row] = await db.select().from(feeInvoices).where(eq(feeInvoices.invoiceId, status.invoiceId)).limit(1);
  if (!row) return null;
  const idle = { credited: false, userId: row.userId, amountKop: 0 };
  if (row.modifiedDate !== null && status.modifiedDate <= row.modifiedDate) return idle;
  const paid = status.status === "success" && status.amount === row.amount;
  const update = db
    .update(feeInvoices)
    .set({ status: status.status, modifiedDate: status.modifiedDate, ...(paid ? { paidAt: now } : {}) })
    .where(eq(feeInvoices.id, row.id));
  if (!paid) {
    await update;
    return idle;
  }
  const amountKop = status.finalAmount ?? status.amount;
  const entry = db
    .insert(feeEntries)
    .values({ id: `fee_${crypto.randomUUID().slice(0, 12)}`, userId: row.userId, kind: "payment", amount: -amountKop, invoiceId: row.invoiceId, note: "Оплата рахунку", createdBy: "system", createdAt: now })
    .onConflictDoNothing()
    .returning({ id: feeEntries.id });
  const [inserted] = await db.batch([entry, update]);
  return inserted.length > 0 ? { credited: true, userId: row.userId, amountKop } : idle;
};
