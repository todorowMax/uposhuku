// lib/server/account-delete.ts
//
// Видалення акаунта. Рядок у `users` НІКОЛИ не видаляється фізично: на нього посилаються угоди, платежі, відгуки,
// скарги, а зовнішні ключі з `onDelete: cascade` стерли б їх разом з рядком. Тому акаунт стає «могилою»:
// пошта `deleted-<id>@deleted.invalid`, ім'я, аватар, Google-id порожні, `deleted_at` стоїть, вхід закритий.
//
// Що з кожною таблицею (таблиця з брифу L3, рішення):
//   users                      обезличити (рядок лишається)
//   sessions, email_codes, deal_release_codes, wallet_challenges, admin_totp_state, presence,
//   telegram_links, telegram_link_tokens, notification_preferences, notification_log,
//   tag_proposal_uses, auth_attempts (за поштою)             видалити
//   profiles, profile_tags, projects, project_tags + R2 photos/<id>/   видалити
//   requests, request_tags, request_files, channel_posts (+ пост у каналі), responses   видалити
//   payout_accounts (ІПН), payout_requisites                видалити
//   legal_acceptances          лишити останню на документ без ip_hash, решту видалити
//   conversations, messages, chat_attachments (+ R2 chat/)  з угодою: лишити; без угоди: видалити
//   deals                      лишити; ім'я й фото виконавця в JSON замінені; ще не прийняті й прийняті без грошей скасовані
//   deal_requisites, requisite_reads   знімок реквізитів виконавця: закрита без спорів і скарг: видалити; інакше до кінця строку (account-retention)
//   deal_payments, crypto_proofs, moderation_actions, deal_complaints   лишити
//   payments, placement_invoices   лишити (податковий облік)
//   reviews                    лишити; свої відгуки підписані «Замовник»; відгуки про виконавця лишаються в базі, але профілю немає, тож їх ніде не видно
//   телеметрія (окрема база): user_id → NULL
//
// Усі записи в основну базу йдуть одним `batch` (транзакція D1): або все, або нічого. Файли в R2 і пост у Telegram
// прибираємо після нього, з найкращих зусиль: збій там не повертає акаунт назад.

import { and, eq, inArray, notExists, or, sql } from "drizzle-orm";
import {
  adminTotpState,
  authAttempts,
  channelPosts,
  chatAttachments,
  conversations,
  dealComplaints,
  dealPayments,
  dealReleaseCodes,
  dealRequisites,
  deals,
  emailCodes,
  legalAcceptances,
  messages,
  notificationLog,
  notificationPreferences,
  payoutAccounts,
  payoutRequisites,
  presence,
  profileTags,
  profiles,
  projectTags,
  projects,
  requestFiles,
  requestTags,
  requisiteReads,
  requests,
  responses,
  reviews,
  sessions,
  tagProposalUses,
  telegramLinkTokens,
  telegramLinks,
  users,
  walletChallenges,
} from "@/db/schema";
import { complaintBlocker, DELETED_NAME, DELETED_REVIEW_AUTHOR, dealGrip, moneyBlocker, requisitesDeletableNow, tombstoneEmail, type DeleteBlocker, withoutPerformerIdentity } from "@/lib/account/deletion";
import { performerIdOf } from "@/lib/deals/parties";
import type { Deal } from "@/lib/deals/types";
import { cleanOutside, collectOutside, type Outside } from "./account-external";
import { getDb, inChunks } from "./db";
import { mutateDeal } from "./deal-repo";

/** Стани рахунку в банку, коли гроші ще можуть прийти або лежать на холді. */
const LIVE_PAYMENT_STATUSES = ["creating", "created", "processing", "hold"];

type DealRow = typeof deals.$inferSelect;

const dealsOf = async (userId: string): Promise<DealRow[]> => getDb().select().from(deals).where(or(eq(deals.ownerUserId, userId), eq(deals.performerId, performerIdOf(userId))));

/** Розмова пари (замовник|виконавець) → id: щоб блокер вів до чату з угодою. */
const conversationIdsOf = async (userId: string): Promise<Map<string, string>> => {
  const rows = await getDb()
    .select({ id: conversations.id, customer: conversations.customerUserId, performerId: conversations.performerId })
    .from(conversations)
    .where(or(eq(conversations.customerUserId, userId), eq(conversations.performerUserId, userId)));
  return new Map(rows.map((row) => [`${row.customer}|${row.performerId}`, row.id]));
};

/** Чи є в людини угоди (тоді видалення підтверджується кодом з пошти). */
export const hasDeals = async (userId: string): Promise<boolean> => (await getDb().select({ id: deals.id }).from(deals).where(or(eq(deals.ownerUserId, userId), eq(deals.performerId, performerIdOf(userId)))).limit(1)).length > 0;

/**
 * Що заважає видалити: угоди з грошима в русі (за станом етапів, ескроу не закрите, рахунок у банку ще живий) і відкриті скарги.
 * Порожній список: можна.
 */
export const deleteBlockers = async (userId: string): Promise<DeleteBlocker[]> => {
  const rows = await dealsOf(userId);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const db = getDb();
  const [live, complaints, convs] = await Promise.all([
    inChunks(ids, (chunk) => db.select({ dealId: dealPayments.dealId }).from(dealPayments).where(and(inArray(dealPayments.dealId, chunk), inArray(dealPayments.status, LIVE_PAYMENT_STATUSES)))),
    inChunks(ids, (chunk) => db.select({ dealId: dealComplaints.dealId }).from(dealComplaints).where(and(inArray(dealComplaints.dealId, chunk), eq(dealComplaints.status, "open")))),
    conversationIdsOf(userId),
  ]);
  const withLive = new Set(live.map((item) => item.dealId));
  const withComplaint = new Set(complaints.map((item) => item.dealId));
  const blockers: DeleteBlocker[] = [];
  for (const row of rows) {
    const deal = JSON.parse(row.data) as Deal;
    const conversationId = convs.get(`${row.ownerUserId}|${row.performerId}`) ?? deal.conversationId ?? null;
    if (dealGrip(deal) === "money") blockers.push(moneyBlocker(deal, conversationId));
    else if (withLive.has(row.id)) blockers.push(moneyBlocker(deal, conversationId, "рахунок у банку ще не закрито"));
    if (withComplaint.has(row.id)) blockers.push(complaintBlocker(deal, conversationId));
  }
  return blockers;
};

/**
 * Угоди перед видаленням: ще не прийняті й прийняті без грошей скасовуємо, ім'я виконавця в JSON замінюємо.
 * Зміна дивиться на свіжий стан угоди (mutateDeal перечитує): якщо гроші зайшли після перевірки, повертаємо false.
 */
const settleDeals = async (userId: string, rows: DealRow[], now: number): Promise<boolean> => {
  for (const row of rows) {
    const asPerformer = row.performerId === performerIdOf(userId);
    const result = await mutateDeal(
      row.id,
      (deal) => {
        const grip = dealGrip(deal);
        if (grip === "money") return "money";
        const base: Deal = grip === "idle" ? { ...deal, status: "cancelled" } : deal;
        const named = asPerformer && (base.performer.name !== DELETED_NAME || base.performer.photo || base.performer.specialty);
        const next = named ? withoutPerformerIdentity(base) : base;
        return next === deal ? undefined : next;
      },
      now,
    );
    if (result === "money") return false;
    if (typeof result === "string") throw new Error(result);
  }
  return true;
};

/** Яка згода лишається: найновіша на кожен документ. Решта йде під видалення. */
const splitAcceptances = (rows: { id: string; doc: string; acceptedAt: number }[]): { keep: string[]; drop: string[] } => {
  const latest = new Map<string, { id: string; acceptedAt: number }>();
  for (const row of rows) {
    const seen = latest.get(row.doc);
    if (!seen || row.acceptedAt > seen.acceptedAt) latest.set(row.doc, row);
  }
  const keep = [...latest.values()].map((row) => row.id);
  return { keep, drop: rows.filter((row) => !keep.includes(row.id)).map((row) => row.id) };
};

export type DeleteResult = { kind: "deleted" } | { kind: "already" } | { kind: "missing" } | { kind: "blocked"; blockers: DeleteBlocker[] };

/** Розмови користувача без жодної угоди пари: їх прибираємо разом з повідомленнями й фото. */
const doomedConversations = async (userId: string): Promise<string[]> =>
  (
    await getDb()
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          or(eq(conversations.customerUserId, userId), eq(conversations.performerUserId, userId)),
          notExists(getDb().select({ one: sql`1` }).from(deals).where(and(eq(deals.ownerUserId, conversations.customerUserId), eq(deals.performerId, conversations.performerId)))),
        ),
      )
  ).map((row) => row.id);

/** Знімки реквізитів угод, де людина виконавець, які можна стерти зараз (закрита без спорів і скарг). */
const requisitesToDrop = async (rows: DealRow[], userId: string): Promise<string[]> => {
  const mine = rows.filter((row) => row.performerId === performerIdOf(userId));
  if (mine.length === 0) return [];
  const complained = new Set((await inChunks(mine.map((row) => row.id), (chunk) => getDb().select({ dealId: dealComplaints.dealId }).from(dealComplaints).where(inArray(dealComplaints.dealId, chunk)))).map((item) => item.dealId));
  return mine.filter((row) => requisitesDeletableNow(JSON.parse(row.data) as Deal, complained.has(row.id))).map((row) => row.id);
};

/**
 * Видаляє акаунт. `blocked`: гроші чи скарга, нічого не змінено. `already`: уже видалено (повтор безпечний).
 * Підтвердження слова й коду перевіряє маршрут до цього виклику.
 */
export const deleteAccount = async (userId: string, now = Date.now()): Promise<DeleteResult> => {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { kind: "missing" };
  if (user.deletedAt !== null) return { kind: "already" };
  const blockers = await deleteBlockers(userId);
  if (blockers.length > 0) return { kind: "blocked", blockers };

  const rows = await dealsOf(userId);
  if (!(await settleDeals(userId, rows, now))) return { kind: "blocked", blockers: await deleteBlockers(userId) };

  const doomed = await doomedConversations(userId);
  const outside: Outside = await collectOutside({ userId, conversationIds: doomed });
  const dropRequisites = await requisitesToDrop(rows, userId);
  const acceptances = splitAcceptances(await db.select({ id: legalAcceptances.id, doc: legalAcceptances.doc, acceptedAt: legalAcceptances.acceptedAt }).from(legalAcceptances).where(eq(legalAcceptances.userId, userId)));

  const myRequests = db.select({ id: requests.id }).from(requests).where(eq(requests.userId, userId));
  const myProjects = db.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId));
  const chunked = <T,>(ids: string[], build: (chunk: string[]) => T): T[] => {
    const parts: T[] = [];
    for (let start = 0; start < ids.length; start += 90) parts.push(build(ids.slice(start, start + 90)));
    return parts;
  };
  const statements = [
    db.delete(projectTags).where(inArray(projectTags.projectId, myProjects)),
    db.delete(projects).where(eq(projects.userId, userId)),
    db.delete(profileTags).where(eq(profileTags.userId, userId)),
    db.delete(profiles).where(eq(profiles.userId, userId)),
    db.delete(requestTags).where(inArray(requestTags.requestId, myRequests)),
    db.delete(requestFiles).where(inArray(requestFiles.requestId, myRequests)),
    db.delete(channelPosts).where(inArray(channelPosts.requestId, myRequests)),
    db.delete(responses).where(or(eq(responses.performerUserId, userId), inArray(responses.requestId, myRequests))),
    db.delete(requests).where(eq(requests.userId, userId)),
    ...chunked(doomed, (chunk) => db.delete(chatAttachments).where(inArray(chatAttachments.conversationId, chunk))),
    ...chunked(doomed, (chunk) => db.delete(messages).where(inArray(messages.conversationId, chunk))),
    ...chunked(doomed, (chunk) => db.delete(conversations).where(inArray(conversations.id, chunk))),
    ...chunked(dropRequisites, (chunk) => db.delete(requisiteReads).where(inArray(requisiteReads.dealId, chunk))),
    ...chunked(dropRequisites, (chunk) => db.delete(dealRequisites).where(inArray(dealRequisites.dealId, chunk))),
    ...chunked(acceptances.drop, (chunk) => db.delete(legalAcceptances).where(inArray(legalAcceptances.id, chunk))),
    ...chunked(acceptances.keep, (chunk) => db.update(legalAcceptances).set({ ipHash: null }).where(inArray(legalAcceptances.id, chunk))),
    db.update(reviews).set({ author: DELETED_REVIEW_AUTHOR }).where(eq(reviews.authorUserId, userId)),
    db.delete(payoutAccounts).where(eq(payoutAccounts.userId, userId)),
    db.delete(payoutRequisites).where(eq(payoutRequisites.userId, userId)),
    db.delete(walletChallenges).where(eq(walletChallenges.userId, userId)),
    db.delete(dealReleaseCodes).where(eq(dealReleaseCodes.userId, userId)),
    db.delete(adminTotpState).where(eq(adminTotpState.userId, userId)),
    db.delete(telegramLinks).where(eq(telegramLinks.userId, userId)),
    db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.userId, userId)),
    db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db.delete(notificationLog).where(eq(notificationLog.userId, userId)),
    db.delete(tagProposalUses).where(eq(tagProposalUses.userId, userId)),
    db.delete(presence).where(eq(presence.userId, userId)),
    db.delete(emailCodes).where(eq(emailCodes.userId, userId)),
    db.delete(authAttempts).where(eq(authAttempts.key, `email:${user.email}`)),
    db.delete(sessions).where(eq(sessions.userId, userId)),
    // Останнім: рядок користувача лишається, але без особистого.
    db.update(users).set({ email: tombstoneEmail(userId), displayName: null, avatarUrl: null, googleId: null, emailVerifiedAt: null, lastLoginAt: null, deletedAt: now }).where(and(eq(users.id, userId), sql`${users.deletedAt} is null`)),
  ];
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  await cleanOutside(userId, outside);
  return { kind: "deleted" };
};
