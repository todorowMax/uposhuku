// lib/server/payout-repo.ts
//
// Підключення виконавця до виплат безпечної угоди (Monobank, розщеплення). Заявка лежить у payout_accounts зі
// статусом `pending`; ІПН зберігається лише зашифрованим (secret-box, aad = id користувача), на екрані тільки маска.
// Адміністратор звіряє ІПН зі списком отримувачів банку: збіг робить рахунок `active`. `receiverId` у списку
// банку може змінитися (у тестовому середовищі змінюється), тому під час створення рахунку на оплату
// його беремо зі свіжого списку (`freshReceiverId`), а в самому рахунку він фіксується в корзині.

import { desc, eq } from "drizzle-orm";
import { payoutAccounts, users } from "@/db/schema";
import { maskTaxId, normalizeTaxId, type PayoutApplication } from "@/lib/deals/payout";
import { listSplitReceivers } from "@/lib/monobank/client";
import { getDb } from "./db";
import { openText, sealText } from "./secret-box";

const PROVIDER = "monobank";

export interface OwnPayout {
  status: "pending" | "active" | "rejected";
  fopName: string;
  taxIdMask: string;
  consentAt: number | null;
  checkedAt: number | null;
  /** Причина відхилення чи відключення (для статусу `rejected`). */
  rejectReason: string | null;
}

export interface PayoutRow extends OwnPayout {
  userId: string;
  email: string;
  createdAt: number;
}

type Row = typeof payoutAccounts.$inferSelect;

const toOwn = (row: Row): OwnPayout => ({
  status: row.status as OwnPayout["status"],
  fopName: row.fopName ?? "",
  taxIdMask: row.taxIdMask ?? "",
  consentAt: row.consentAt,
  checkedAt: row.checkedAt,
  rejectReason: row.status === "rejected" ? row.rejectReason : null,
});

const rowOf = async (userId: string): Promise<Row | null> => (await getDb().select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1))[0] ?? null;

/** Своя заявка або null, якщо виконавець ще не подавав. */
export const getOwnPayout = async (userId: string): Promise<OwnPayout | null> => {
  const row = await rowOf(userId);
  return row && row.provider === PROVIDER && row.fopName ? toOwn(row) : null;
};

export type SubmitOutcome = { kind: "submitted" } | { kind: "already_active" };

/**
 * Подає заявку. Активний рахунок не переписуємо (інакше можна підмінити ФОП після перевірки): змінити його
 * зможе лише підтримка. Відхилену чи очікувальну заявку можна подати знову.
 */
export const submitPayout = async (userId: string, application: PayoutApplication, now = Date.now()): Promise<SubmitOutcome> => {
  const current = await rowOf(userId);
  if (current?.status === "active") return { kind: "already_active" };
  const values = {
    taxId: await sealText(application.taxId, userId),
    taxIdMask: maskTaxId(application.taxId),
    fopName: application.fopName,
    receiverId: null,
    status: "pending",
    consentAt: now,
    accountConfirmedAt: now,
    checkedAt: null,
    rejectReason: null,
    updatedAt: now,
  };
  await getDb()
    .insert(payoutAccounts)
    .values({ id: `pa_${crypto.randomUUID().slice(0, 8)}`, userId, provider: PROVIDER, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [payoutAccounts.userId, payoutAccounts.provider], set: values });
  return { kind: "submitted" };
};

/** Заявки для адміністратора: спершу ті, що чекають перевірки, потім решта, свіжі зверху. */
export const listPayoutApplications = async (): Promise<PayoutRow[]> => {
  const rows = await getDb()
    .select({ row: payoutAccounts, email: users.email })
    .from(payoutAccounts)
    .innerJoin(users, eq(users.id, payoutAccounts.userId))
    .orderBy(desc(payoutAccounts.createdAt));
  const list = rows.filter(({ row }) => row.fopName).map(({ row, email }) => ({ ...toOwn(row), userId: row.userId, email, createdAt: row.createdAt }));
  return [...list.filter((item) => item.status === "pending"), ...list.filter((item) => item.status !== "pending")];
};

export type RejectOutcome = { kind: "rejected"; was: "pending" | "active" | "rejected" } | { kind: "missing" };

/**
 * Відхиляє заявку чи відключає активний рахунок: статус `rejected`, причина для виконавця, `receiverId`
 * скидається, тож нові рахунки на оплату по ньому не створюються. Рахунки, що вже виставлені, банк веде сам.
 * Виконавець бачить причину й може подати заявку знову.
 */
export const rejectPayout = async (userId: string, reason: string, now = Date.now()): Promise<RejectOutcome> => {
  const row = await rowOf(userId);
  if (!row || !row.fopName) return { kind: "missing" };
  await getDb().update(payoutAccounts).set({ status: "rejected", rejectReason: reason, receiverId: null, checkedAt: now, updatedAt: now }).where(eq(payoutAccounts.id, row.id));
  return { kind: "rejected", was: row.status as "pending" | "active" | "rejected" };
};

/** ІПН виконавця відкритим текстом: лише для звірки з банком, ніколи не віддається назовні. */
const taxIdOf = async (row: Row): Promise<string | null> => (row.taxId ? normalizeTaxId(await openText(row.taxId, row.userId)) : null);

/** Отримувач розщеплення з банку за ІПН (edrpou). Помилка банку піднімається. */
const receiverFor = async (taxId: string): Promise<string | null> => (await listSplitReceivers()).find((item) => normalizeTaxId(item.edrpou) === taxId)?.id ?? null;

export type VerifyOutcome = { kind: "active"; receiverId: string } | { kind: "not_found" } | { kind: "missing" };

/** «Перевірити в банку»: ІПН заявки є у списку отримувачів → рахунок активний. Помилка банку піднімається. */
export const verifyPayout = async (userId: string, now = Date.now()): Promise<VerifyOutcome> => {
  const row = await rowOf(userId);
  const taxId = row ? await taxIdOf(row) : null;
  if (!row || !taxId) return { kind: "missing" };
  const receiverId = await receiverFor(taxId);
  if (!receiverId) {
    await getDb().update(payoutAccounts).set({ checkedAt: now, updatedAt: now }).where(eq(payoutAccounts.id, row.id));
    return { kind: "not_found" };
  }
  await getDb().update(payoutAccounts).set({ status: "active", receiverId, checkedAt: now, updatedAt: now }).where(eq(payoutAccounts.id, row.id));
  return { kind: "active", receiverId };
};

/**
 * Свіжий `receiverId` активного виконавця: список банку перепитується при кожному рахунку.
 * null, якщо активного рахунку немає чи банк більше не знає цього ІПН. Помилка банку піднімається.
 */
export const freshReceiverId = async (userId: string): Promise<string | null> => {
  const row = await rowOf(userId);
  if (!row || row.status !== "active") return null;
  const taxId = await taxIdOf(row);
  return taxId ? receiverFor(taxId) : null;
};
