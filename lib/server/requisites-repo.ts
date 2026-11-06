// lib/server/requisites-repo.ts
//
// Реквізити виконавця для прямого переказу на D1. У базі лише шифротекст і маска.
// Перше збереження діє одразу; зміна чекає REQUISITES_DELAY_MS і стає поточною при
// найближчому читанні. Замовник бачить знімок, зроблений при прийнятті угоди.

import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { dealRequisites, deals, payoutRequisites, requisiteReads } from "@/db/schema";
import { performerIdOf, performerUserId } from "@/lib/deals/parties";
import { maskOf, paymentMethods, visibleRequisites, type MethodAccess, type PaymentMethod, type Requisites } from "@/lib/deals/requisites";
import { getDb } from "./db";
import { openText, sealText } from "./secret-box";

/** Скільки нові реквізити чекають, перш ніж почати діяти. */
export const REQUISITES_DELAY_MS = 24 * 60 * 60 * 1000;

export interface OwnRequisites {
  requisites: Requisites | null;
  mask: string | null;
  pending: { requisites: Requisites; mask: string; effectiveAt: number } | null;
}

export type SaveOutcome = { kind: "saved" } | { kind: "pending"; effectiveAt: number };

const seal = (value: Requisites, userId: string) => sealText(JSON.stringify(value), userId);
const open = async (cipher: string, userId: string) => JSON.parse(await openText(cipher, userId)) as Requisites;

/** Якщо час очікування збіг, нові значення стають поточними. Один атомарний запит: безпечно при гонці. */
const settle = async (userId: string, now: number) => {
  await getDb()
    .update(payoutRequisites)
    .set({ cipher: sql`${payoutRequisites.pendingCipher}`, mask: sql`${payoutRequisites.pendingMask}`, pendingCipher: null, pendingMask: null, pendingAt: null, updatedAt: now })
    .where(and(eq(payoutRequisites.userId, userId), isNotNull(payoutRequisites.pendingCipher), lte(payoutRequisites.pendingAt, now)));
};

const rowOf = async (userId: string, now: number) => {
  await settle(userId, now);
  const [row] = await getDb().select().from(payoutRequisites).where(eq(payoutRequisites.userId, userId)).limit(1);
  return row ?? null;
};

/** Свої реквізити: поточні та ті, що чекають. */
export const getOwnRequisites = async (userId: string, now = Date.now()): Promise<OwnRequisites> => {
  const row = await rowOf(userId, now);
  if (!row) return { requisites: null, mask: null, pending: null };
  return {
    requisites: await open(row.cipher, userId),
    mask: row.mask,
    pending: row.pendingCipher && row.pendingMask && row.pendingAt ? { requisites: await open(row.pendingCipher, userId), mask: row.pendingMask, effectiveAt: row.pendingAt } : null,
  };
};

/** Зберегти: уперше одразу, далі як очікуючу зміну (повторна правка перезапускає очікування). */
export const saveOwnRequisites = async (userId: string, value: Requisites, now = Date.now()): Promise<SaveOutcome> => {
  const cipher = await seal(value, userId);
  const mask = maskOf(value);
  const db = getDb();
  const current = await rowOf(userId, now);
  if (!current) {
    await db.insert(payoutRequisites).values({ userId, cipher, mask, createdAt: now, updatedAt: now }).onConflictDoNothing();
    return { kind: "saved" };
  }
  const effectiveAt = now + REQUISITES_DELAY_MS;
  await db.update(payoutRequisites).set({ pendingCipher: cipher, pendingMask: mask, pendingAt: effectiveAt, updatedAt: now }).where(eq(payoutRequisites.userId, userId));
  return { kind: "pending", effectiveAt };
};

export type AttachOutcome = SaveOutcome | { kind: "unchanged" } | { kind: "no_requisites" };

/**
 * Прикріпити підтверджену підписом адресу гаманця. Вона йде тим самим шляхом, що й зміна реквізитів: чекає
 * REQUISITES_DELAY_MS і стає поточною при найближчому читанні. Спершу мають бути збережені реквізити.
 */
export const attachWalletAddress = async (userId: string, address: string, now = Date.now()): Promise<AttachOutcome> => {
  const own = await getOwnRequisites(userId, now);
  const latest = own.pending?.requisites ?? own.requisites;
  if (!latest) return { kind: "no_requisites" };
  if (latest.walletAddress?.toLowerCase() === address.toLowerCase()) return { kind: "unchanged" };
  return saveOwnRequisites(userId, { ...latest, walletAddress: address }, now);
};

/** Зняти знімок поточних реквізитів виконавця в угоду. Шифротекст копіюємо як є, ключ не потрібен. Повертає, чи знімок є. */
export const snapshotDealRequisites = async (dealId: string, performerUser: string, now = Date.now()): Promise<boolean> => {
  const db = getDb();
  const [existing] = await db.select({ dealId: dealRequisites.dealId }).from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  if (existing) return true;
  const row = await rowOf(performerUser, now);
  if (!row) return false;
  await db.insert(dealRequisites).values({ dealId, cipher: row.cipher, mask: row.mask, createdAt: now }).onConflictDoNothing();
  return true;
};

export interface DealRequisitesView {
  requisites: Requisites | null;
  mask: string | null;
}

/**
 * Реквізити угоди для однієї з її сторін. null: угоди немає, ти не сторона, не прямий переказ
 * чи угода не прийнята (для чужого це все «не знайдено»). Замовника записуємо в журнал читань.
 */
export const readDealRequisites = async (dealId: string, viewerUserId: string, now = Date.now()): Promise<DealRequisitesView | null> => {
  const db = getDb();
  const [deal] = await db.select({ ownerUserId: deals.ownerUserId, performerId: deals.performerId, status: deals.status, data: deals.data }).from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal) return null;
  const isOwner = deal.ownerUserId === viewerUserId;
  if (!isOwner && deal.performerId !== performerIdOf(viewerUserId)) return null;
  if (deal.status !== "accepted" || (JSON.parse(deal.data) as { method?: string }).method !== "direct") return null;

  let [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  const performerUser = performerUserId(deal.performerId);
  // Виконавець указав реквізити вже після прийняття: знімок береться при першому читанні.
  if (!snapshot && performerUser && (await snapshotDealRequisites(dealId, performerUser, now))) {
    [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  }
  if (!snapshot || !performerUser) return { requisites: null, mask: null };
  const requisites = await open(snapshot.cipher, performerUser);
  if (isOwner) await db.insert(requisiteReads).values({ id: `rr_${crypto.randomUUID().slice(0, 10)}`, dealId, readerUserId: viewerUserId, createdAt: now });
  return { requisites, mask: snapshot.mask };
};

/**
 * Підтверджена адреса гаманця виконавця зі знімка угоди (для ескроу). Службове читання сервера: у журнал читань не
 * пишеться, назовні віддається лише адреса. Знімок береться, якщо його ще немає.
 */
export const dealWalletAddress = async (dealId: string, now = Date.now()): Promise<string | null> => {
  const db = getDb();
  const [deal] = await db.select({ performerId: deals.performerId }).from(deals).where(eq(deals.id, dealId)).limit(1);
  const performerUser = deal ? performerUserId(deal.performerId) : null;
  if (!performerUser) return null;
  let [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  if (!snapshot && (await snapshotDealRequisites(dealId, performerUser, now))) [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  if (!snapshot) return null;
  return (await open(snapshot.cipher, performerUser)).walletAddress ?? null;
};

/**
 * Способи оплати зі знімка угоди (лише назви, без значень) для перевірки «Я оплатив(ла)». Службове читання сервера:
 * у журнал читань не пишеться. Знімка немає: порожній список.
 */
export const dealSnapshotMethods = async (dealId: string, now = Date.now()): Promise<PaymentMethod[]> => {
  const db = getDb();
  const [deal] = await db.select({ performerId: deals.performerId }).from(deals).where(eq(deals.id, dealId)).limit(1);
  const performerUser = deal ? performerUserId(deal.performerId) : null;
  if (!performerUser) return [];
  let [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  if (!snapshot && (await snapshotDealRequisites(dealId, performerUser, now))) [snapshot] = await db.select().from(dealRequisites).where(eq(dealRequisites.dealId, dealId)).limit(1);
  return snapshot ? paymentMethods(await open(snapshot.cipher, performerUser)) : [];
};

/**
 * Способи, які зараз приймає виконавець, для цієї людини за її прапорцями. Лише назви: значень замовник
 * до прийняття угоди не бачить. Реквізитів немає: порожній список.
 */
export const performerMethods = async (performerUser: string, access: MethodAccess, now = Date.now()): Promise<PaymentMethod[]> => {
  const row = await rowOf(performerUser, now);
  return row ? paymentMethods(visibleRequisites(await open(row.cipher, performerUser), access)) : [];
};
