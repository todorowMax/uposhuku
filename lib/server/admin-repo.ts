// lib/server/admin-repo.ts
//
// Дані для адмінки спорів: список, повна картка з перепискою й журнал рішень.
// Нічого не перевіряє про того, хто питає: це робить lib/server/admin.ts у кожному
// маршруті й на кожній сторінці. Переписку віддаємо лише для угод, де був спір.

import { desc, eq, inArray, sql } from "drizzle-orm";
import { conversations, deals, moderationActions, profiles, requests, users } from "@/db/schema";
import type { DecisionLogRow, DisputeCard, DisputeMessage, DisputeParty, DisputeRow } from "@/lib/admin/types";
import { dealTotal, disputedStage } from "@/lib/deals/machine";
import type { Deal, DealStage, ModeratorAction } from "@/lib/deals/types";
import { CITIES } from "@/lib/map/cities";
import { getDb, inChunks } from "./db";
import { findChatAttachment, listMessages } from "./chat-repo";
import { getProfile } from "./profile-repo";

type DealRow = typeof deals.$inferSelect;
const parse = (row: DealRow) => JSON.parse(row.data) as Deal;
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

const titleOf = (deal: Deal, requestTexts: Map<string, string>) => {
  const raw = deal.title ?? requestTexts.get(deal.requestId) ?? "Замовлення";
  return raw.length > 80 ? `${raw.slice(0, 79).trimEnd()}…` : raw;
};

const requestTexts = async (rows: Deal[]) => {
  const ids = [...new Set(rows.map((deal) => deal.requestId))].filter((id) => !id.startsWith("direct:"));
  const found = await inChunks(ids, (chunk) => getDb().select({ id: requests.id, text: requests.text }).from(requests).where(inArray(requests.id, chunk)));
  return new Map(found.map((item) => [item.id, item.text]));
};

const userName = (user?: typeof users.$inferSelect) => user?.displayName ?? user?.email.split("@")[0] ?? "Невідомо";

/** Етап, на якому був або є спір: відкритий, а для розв'язаного — той, що в журналі. */
const stageOfInterest = (deal: Deal, stageId?: string): DealStage => (stageId ? deal.stages.find((item) => item.id === stageId) : undefined) ?? disputedStage(deal) ?? deal.stages[deal.stages.length - 1];

/**
 * Спори: відкриті (будь-який етап у статусі «спір») свіжі першими, і останні
 * розв'язані. Угод зі спором мало, тож фільтруємо в коді, а не розкладаємо JSON в SQL.
 */
export const listDisputes = async (): Promise<{ open: DisputeRow[]; resolved: DisputeRow[] }> => {
  const db = getDb();
  const openRows = await db.select().from(deals).where(sql`json_extract(${deals.data}, '$.disputed') = 1`).orderBy(desc(deals.updatedAt)).limit(200);
  const log = await db.select().from(moderationActions).orderBy(desc(moderationActions.createdAt)).limit(60);
  const resolvedIds = [...new Set(log.map((item) => item.dealId))].filter((id) => !openRows.some((row) => row.id === id));
  const resolvedRows = await inChunks(resolvedIds, (chunk) => db.select().from(deals).where(inArray(deals.id, chunk)));

  const all = [...openRows, ...resolvedRows];
  const parsed = all.map(parse);
  const texts = await requestTexts(parsed);
  const customerIds = [...new Set(all.map((row) => row.ownerUserId))];
  const performerIds = [...new Set(all.map((row) => row.performerId).filter((id) => id.startsWith("me-")).map((id) => id.slice(3)))];
  const everyone = [...customerIds, ...performerIds];
  const people = await inChunks(everyone, (chunk) => db.select().from(users).where(inArray(users.id, chunk)));
  const profileNames = new Map((await inChunks(everyone, (chunk) => db.select({ userId: profiles.userId, name: profiles.name }).from(profiles).where(inArray(profiles.userId, chunk)))).map((item) => [item.userId, item.name]));
  const nameOf = (user?: typeof users.$inferSelect) => (user && profileNames.get(user.id)) || userName(user);

  const toRow = (row: DealRow, decision: DisputeRow["decision"]): DisputeRow => {
    const deal = parse(row);
    const logged = log.find((item) => item.dealId === row.id);
    const stage = stageOfInterest(deal, decision ? logged?.stageId : undefined);
    const performerUser = row.performerId.startsWith("me-") ? people.find((user) => user.id === row.performerId.slice(3)) : undefined;
    return {
      dealId: deal.id,
      number: deal.number,
      title: titleOf(deal, texts),
      total: dealTotal(deal),
      stageTitle: stage.title,
      stageAmount: stage.amount,
      method: deal.method,
      customerName: nameOf(people.find((user) => user.id === row.ownerUserId)),
      performerName: performerUser ? nameOf(performerUser) : deal.performer.name,
      openedAt: stage.disputedAt ?? iso(row.updatedAt) ?? "",
      holdUntil: decision ? null : (stage.holdUntil ?? null),
      decision,
    };
  };

  const open = openRows.map((row) => toRow(row, null)).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const resolved = resolvedRows
    .map((row) => {
      const logged = log.find((item) => item.dealId === row.id);
      return toRow(row, logged ? { action: logged.action as ModeratorAction, at: new Date(logged.createdAt).toISOString() } : null);
    })
    .sort((a, b) => (b.decision?.at ?? "").localeCompare(a.decision?.at ?? ""));
  return { open, resolved };
};

const partyOf = async (userId: string | null, fallback: { name: string; specialty?: string }): Promise<DisputeParty> => {
  const [user] = userId ? await getDb().select().from(users).where(eq(users.id, userId)).limit(1) : [];
  const profile = userId ? await getProfile(userId) : null;
  return {
    demo: !userId,
    userId,
    name: profile?.name || userName(user) || fallback.name,
    email: user?.email ?? null,
    specialty: profile?.specialty ?? fallback.specialty ?? "",
    city: CITIES.find((city) => city.id === profile?.cityId)?.name ?? "",
    bio: profile?.bio ?? "",
    photo: profile?.photo ?? "",
    published: profile?.published ?? false,
    joinedAt: iso(user?.createdAt),
    lastLoginAt: iso(user?.lastLoginAt),
  };
};

/** Розмова, у якій домовлялись про угоду: з умов, або за парою замовник + виконавець. */
export const conversationOfDeal = async (row: DealRow, deal: Deal): Promise<string | null> => {
  const db = getDb();
  if (deal.conversationId) return deal.conversationId;
  const [found] = await db.select({ id: conversations.id }).from(conversations).where(sql`${conversations.customerUserId} = ${row.ownerUserId} and ${conversations.performerId} = ${row.performerId}`).limit(1);
  return found?.id ?? null;
};

/** Спір бачимо лише в угоді, де його відкривали або вже розглянули. */
const wasDisputed = async (row: DealRow, deal: Deal) => {
  if (deal.disputed || deal.stages.some((stage) => stage.status === "disputed")) return true;
  const [logged] = await getDb().select({ id: moderationActions.id }).from(moderationActions).where(eq(moderationActions.dealId, row.id)).limit(1);
  return Boolean(logged);
};

export const findDisputedDeal = async (dealId: string): Promise<{ row: DealRow; deal: Deal } | null> => {
  const [row] = await getDb().select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!row) return null;
  const deal = parse(row);
  return (await wasDisputed(row, deal)) ? { row, deal } : null;
};

export const getDisputeCard = async (dealId: string): Promise<DisputeCard | null> => {
  const found = await findDisputedDeal(dealId);
  if (!found) return null;
  const { row, deal } = found;
  const db = getDb();
  const texts = await requestTexts([deal]);
  const conversationId = await conversationOfDeal(row, deal);
  const messages: DisputeMessage[] = conversationId
    ? (await listMessages(conversationId)).map((message) => ({
        id: message.id,
        from: message.from,
        kind: message.kind ?? "text",
        text: message.text,
        at: message.at,
        contextId: message.contextId ?? null,
        photos: (message.attachments ?? []).map((item) => adminAttachmentUrl(dealId, item.id)),
      }))
    : [];
  const logRows = await db.select().from(moderationActions).where(eq(moderationActions.dealId, dealId)).orderBy(desc(moderationActions.createdAt));
  const log: DecisionLogRow[] = logRows.map((item) => ({ id: item.id, stageId: item.stageId, action: item.action, comment: item.comment, adminEmail: item.adminEmail, at: new Date(item.createdAt).toISOString() }));
  const performerUserId = row.performerId.startsWith("me-") ? row.performerId.slice(3) : null;
  return {
    deal,
    title: titleOf(deal, texts),
    customer: await partyOf(row.ownerUserId, { name: "Замовник" }),
    performer: await partyOf(performerUserId, { name: deal.performer.name, specialty: deal.performer.specialty }),
    conversationId,
    messages,
    log,
    openStageId: disputedStage(deal)?.id ?? null,
  };
};

export const adminAttachmentUrl = (dealId: string, attachmentId: string) => `/api/admin/disputes/${dealId}/attachments/${attachmentId}`;

/** Фото з переписки спору: лише з розмови цієї угоди. */
export const findDisputeAttachment = async (dealId: string, attachmentId: string) => {
  const found = await findDisputedDeal(dealId);
  if (!found) return null;
  const conversationId = await conversationOfDeal(found.row, found.deal);
  return conversationId ? findChatAttachment(conversationId, attachmentId) : null;
};
