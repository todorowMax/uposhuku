// lib/server/account-export.ts
//
// Виписка «усе, що ми знаємо про людину» (GET /api/account/export). Лише її власні дані: співрозмовників в угодах і
// відгуках замінює мітка, листування лише її репліки. Не потрапляють секрети: сесії (токени), коди, шифротекст, хеші.
// Реквізити розшифровуємо лише для власника (aad = id користувача). Будує готовий об'єкт, відповідь робить маршрут.

import { eq, inArray, or } from "drizzle-orm";
import { conversations, dealComplaints, deals, legalAcceptances, messages, payments, payoutAccounts, placementInvoices, reviews, sessions, telegramLinks, users } from "@/db/schema";
import { dealsOnlyOwnSide } from "@/lib/account/export-shape";
import { performerIdOf } from "@/lib/deals/parties";
import type { Deal } from "@/lib/deals/types";
import { normalizeTaxId } from "@/lib/deals/payout";
import { getDb, inChunks } from "./db";
import { getPrefs } from "./notification-prefs-repo";
import { getProfile } from "./profile-repo";
import { getOwnRequisites } from "./requisites-repo";
import { listRequests, myResponses } from "./request-repo";
import { openText } from "./secret-box";

const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

/** Реквізити розшифровуємо лише для власника; без ключа шифрування віддаємо null і причину, а не падаємо. */
const ownRequisites = async (userId: string) => {
  try {
    const own = await getOwnRequisites(userId);
    return { current: own.requisites, pending: own.pending?.requisites ?? null, unavailable: false };
  } catch {
    return { current: null, pending: null, unavailable: true };
  }
};

const ownPayout = async (userId: string) => {
  const [row] = await getDb().select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId)).limit(1);
  if (!row) return null;
  let taxId: string | null = null;
  try {
    taxId = row.taxId ? normalizeTaxId(await openText(row.taxId, userId)) : null;
  } catch {
    taxId = null;
  }
  return { provider: row.provider, status: row.status, fopName: row.fopName, taxId, createdAt: iso(row.createdAt), consentAt: iso(row.consentAt) };
};

export const buildAccountExport = async (userId: string, now = Date.now()): Promise<Record<string, unknown>> => {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Немає такого користувача");
  const performerId = performerIdOf(userId);
  const [dealRows, convRows, reviewRows, complaintRows, acceptanceRows, paymentRows, invoiceRows, sessionRows, telegram] = await Promise.all([
    db.select().from(deals).where(or(eq(deals.ownerUserId, userId), eq(deals.performerId, performerId))),
    db.select().from(conversations).where(or(eq(conversations.customerUserId, userId), eq(conversations.performerUserId, userId))),
    db.select().from(reviews).where(or(eq(reviews.authorUserId, userId), eq(reviews.performerId, performerId))),
    db.select().from(dealComplaints).where(eq(dealComplaints.complainantUserId, userId)),
    db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, userId)),
    db.select().from(payments).where(eq(payments.userId, userId)),
    db.select().from(placementInvoices).where(eq(placementInvoices.userId, userId)),
    db.select({ via: sessions.via, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.userId, userId)),
    db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1),
  ]);
  const ownMessages = await inChunks(convRows.map((row) => row.id), (chunk) => db.select().from(messages).where(inArray(messages.conversationId, chunk)));
  const roleIn = new Map(convRows.map((row) => [row.id, row.customerUserId === userId ? "customer" : "performer"]));
  const [profile, requestsList, responseMap, prefs, requisites, payout] = await Promise.all([getProfile(userId), listRequests(userId), myResponses(userId), getPrefs(userId), ownRequisites(userId), ownPayout(userId)]);
  return {
    exportedAt: new Date(now).toISOString(),
    account: { id: user.id, email: user.email, name: user.displayName, googleConnected: user.googleId !== null, createdAt: iso(user.createdAt), emailVerifiedAt: iso(user.emailVerifiedAt), lastLoginAt: iso(user.lastLoginAt), phone: user.phoneVerifiedAt ? { mask: user.phoneMask, verifiedAt: iso(user.phoneVerifiedAt) } : null, signIns: sessionRows.map((row) => ({ via: row.via, at: iso(row.createdAt), expiresAt: iso(row.expiresAt) })) },
    profile,
    requests: requestsList,
    responses: [...responseMap].map(([requestId, response]) => ({ requestId, ...response })),
    messages: ownMessages.filter((message) => message.from === roleIn.get(message.conversationId)).map((message) => ({ conversationId: message.conversationId, text: message.text, kind: message.kind, at: iso(message.createdAt) })),
    deals: dealsOnlyOwnSide(dealRows.map((row) => ({ deal: JSON.parse(row.data) as Deal, asCustomer: row.ownerUserId === userId }))),
    reviews: reviewRows.map((row) => ({ id: row.id, dealId: row.dealId, stars: row.stars, text: row.text, author: row.authorUserId === userId ? row.author : "Замовник", written: row.authorUserId === userId, verified: row.verified === 1, createdAt: iso(row.createdAt) })),
    complaints: complaintRows.map((row) => ({ id: row.id, dealId: row.dealId, stageId: row.stageId, reason: row.reason, text: row.text, status: row.status, createdAt: iso(row.createdAt), closedAt: iso(row.closedAt), closeComment: row.closeComment })),
    requisites: { methods: requisites.current, pendingChange: requisites.pending, unavailable: requisites.unavailable },
    payoutAccount: payout,
    placementPayments: [...paymentRows.map((row) => ({ kind: "payment", amount: row.amount, at: iso(row.createdAt) })), ...invoiceRows.map((row) => ({ kind: "invoice", amount: row.amount, status: row.status, at: iso(row.createdAt) }))],
    legalAcceptances: acceptanceRows.map((row) => ({ doc: row.doc, version: row.version, source: row.source, at: iso(row.acceptedAt) })),
    notificationSettings: prefs,
    telegram: telegram[0] ? { username: telegram[0].username, firstName: telegram[0].firstName, active: telegram[0].active, linkedAt: iso(telegram[0].linkedAt) } : null,
  };
};
