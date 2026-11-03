// lib/server/placement-invoice-repo.ts
//
// Рахунки Monobank за розміщення на карті. Рахунок створює POST /api/placement, його статус
// приносить вебхук або звірка з банком (GET /api/placement/invoices/[id]). Оплату в `payments`
// зараховує лише `success`, рівно раз: id платежу виводиться з id рахунку (`pay_mono_<invoiceId>`),
// тож повтор події чи гонка вебхука зі звіркою вставку не задвоїть. Суми рахунку в гривнях.

import { and, eq } from "drizzle-orm";
import { payments, placementInvoices } from "@/db/schema";
import type { InvoiceStatusResponse } from "@/lib/monobank/client";
import { getDb } from "./db";
import { tierAfterPayment } from "./placement-repo";

/** Статуси, після яких банк уже нічого не змінить для розміщення. */
export const FINAL_STATUSES: readonly string[] = ["success", "failure", "expired", "reversed"];

export interface PlacementInvoice {
  id: string;
  userId: string;
  invoiceId: string;
  amount: number;
  status: string;
  createdAt: number;
}

const toInvoice = (row: typeof placementInvoices.$inferSelect): PlacementInvoice => ({
  id: row.id,
  userId: row.userId,
  invoiceId: row.invoiceId,
  amount: row.amount,
  status: row.status,
  createdAt: row.createdAt,
});

/** Наш id рахунку відомий до виклику банку: він іде в `reference` і в `redirectUrl`. */
export const newPlacementInvoiceId = () => `pin_${crypto.randomUUID().slice(0, 8)}`;

export interface NewPlacementInvoice {
  id: string;
  userId: string;
  amount: number;
  invoiceId: string;
}

/** Записує рахунок, який створили в банку. Початковий статус «created»: далі його міняє вебхук. */
export const createPlacementInvoice = async (input: NewPlacementInvoice, now = Date.now()): Promise<PlacementInvoice> => {
  const row = { id: input.id, userId: input.userId, invoiceId: input.invoiceId, amount: input.amount, status: "created", modifiedDate: null, createdAt: now, updatedAt: now };
  await getDb().insert(placementInvoices).values(row);
  return toInvoice(row);
};

/** Рахунок бачить лише його власник. */
export const getPlacementInvoice = async (id: string, userId: string): Promise<PlacementInvoice | null> => {
  const [row] = await getDb()
    .select()
    .from(placementInvoices)
    .where(and(eq(placementInvoices.id, id), eq(placementInvoices.userId, userId)))
    .limit(1);
  return row ? toInvoice(row) : null;
};

export interface AppliedInvoice {
  /** true лише в тому виклику, який справді додав оплату. */
  credited: boolean;
  userId: string;
  /** Сума рахунку, ₴. */
  amount: number;
}

/**
 * Застосовує статус від банку (вебхук чи звірка). null, якщо рахунок не наш (вебхук спільний із
 * безпечною угодою). Подія з `modifiedDate` не новішою за збережену нічого не міняє. Оплату
 * зараховуємо, лише якщо сума банку збігається з нашою: інакше тільки статус.
 * Вставка платежу й оновлення статусу йдуть одним batch, щоб збій посередині не лишив
 * оплату без статусу (повтор тоді вважався б застарілим).
 */
export const applyInvoiceStatus = async (status: InvoiceStatusResponse, now = Date.now()): Promise<AppliedInvoice | null> => {
  const db = getDb();
  const [row] = await db.select().from(placementInvoices).where(eq(placementInvoices.invoiceId, status.invoiceId)).limit(1);
  if (!row) return null;
  if (row.modifiedDate !== null && status.modifiedDate <= row.modifiedDate) return { credited: false, userId: row.userId, amount: row.amount };

  const update = db.update(placementInvoices).set({ status: status.status, modifiedDate: status.modifiedDate, updatedAt: now }).where(eq(placementInvoices.id, row.id));
  // Повне повернення (оферта: 14 днів): рівень зменшується на повернуту суму, тож зарахований платіж знімаємо.
  if (status.status === "reversed") {
    await db.batch([db.delete(payments).where(eq(payments.id, `pay_mono_${row.invoiceId}`)), update]);
    return { credited: false, userId: row.userId, amount: row.amount };
  }
  if (status.status !== "success" || status.amount !== row.amount * 100) {
    await update;
    return { credited: false, userId: row.userId, amount: row.amount };
  }
  const payment = db
    .insert(payments)
    .values({ id: `pay_mono_${row.invoiceId}`, userId: row.userId, amount: row.amount, tierAfter: await tierAfterPayment(row.userId, row.amount), createdAt: now })
    .onConflictDoNothing()
    .returning({ id: payments.id });
  const [inserted] = await db.batch([payment, update]);
  return { credited: inserted.length > 0, userId: row.userId, amount: row.amount };
};
