// lib/server/deal-repo.ts
//
// Угоди на D1. Угода — документ (JSON з етапами), бо машина станів
// (lib/deals/machine.ts) працює з усім об'єктом.

import { and, desc, eq } from "drizzle-orm";
import { deals, moderationActions } from "@/db/schema";
import { applyAction, applyModeratorAction, applyPerformerAction, createDeal, disputedStage, validateDraft } from "@/lib/deals/machine";
import { DIRECT_RESPONSE_ID, directRequestId, type CardKind, type Deal, type DealAction, type DealDraft, type DealStage, type ModeratorAction, type PerformerAction } from "@/lib/deals/types";
import { conversations } from "@/db/schema";
import { getDb } from "./db";

const parse = (row: typeof deals.$inferSelect) => JSON.parse(row.data) as Deal;

const write = async (ownerUserId: string, deal: Deal, now: number) => {
  await getDb()
    .update(deals)
    .set({ status: deal.status, data: JSON.stringify(deal), updatedAt: now })
    .where(and(eq(deals.id, deal.id), eq(deals.ownerUserId, ownerUserId)));
};

const readAll = async (userId: string): Promise<Deal[]> =>
  (await getDb().select().from(deals).where(eq(deals.ownerUserId, userId)).orderBy(desc(deals.createdAt))).map(parse);

export const listDeals = async (userId: string, requestId?: string): Promise<Deal[]> =>
  (await readAll(userId)).filter((deal) => !requestId || deal.requestId === requestId);

export const proposeDeal = async (userId: string, draft: DealDraft, now = Date.now()): Promise<Deal | string> => {
  const error = validateDraft(draft);
  if (error) return error;
  const existing = await readAll(userId);
  // На один відгук одна жива угода: нову можна після відмови чи скасування.
  if (existing.some((deal) => deal.responseId === draft.responseId && deal.status !== "declined" && deal.status !== "cancelled")) return "З цим виконавцем уже є угода.";
  const deal = createDeal(`deal_${crypto.randomUUID().slice(0, 8)}`, draft, now);
  await getDb().insert(deals).values({
    id: deal.id,
    ownerUserId: userId,
    requestId: deal.requestId,
    responseId: deal.responseId,
    performerId: deal.performer.id,
    status: deal.status,
    data: JSON.stringify(deal),
    createdAt: now,
    updatedAt: now,
  });
  return deal;
};

export const actOnDeal = async (userId: string, id: string, action: DealAction, stageId: string | undefined, now = Date.now(), options: { card?: CardKind } = {}): Promise<Deal | string | null> => {
  const deal = (await readAll(userId)).find((item) => item.id === id);
  if (!deal) return null;
  const result = applyAction(deal, action, stageId, now, options);
  if (typeof result === "string") return result;
  await write(userId, result, now);
  return result;
};

/** Замовник угоди: потрібно, щоб сповістити його про дію виконавця. */
export const ownerOfDeal = async (id: string): Promise<string | null> =>
  (await getDb().select({ ownerUserId: deals.ownerUserId }).from(deals).where(eq(deals.id, id)).limit(1))[0]?.ownerUserId ?? null;

// ───────────── сторона виконавця ─────────────

/** Угоди, запропоновані цьому виконавцю-акаунту; можна звузити до розмови з одним замовником. */
export const listDealsForPerformer = async (performerUserId: string, conversationId?: string): Promise<Deal[]> => {
  const db = getDb();
  let owner: string | undefined;
  if (conversationId) {
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.performerUserId, performerUserId))).limit(1);
    if (!conversation) return [];
    owner = conversation.customerUserId;
  }
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.performerId, `me-${performerUserId}`), ...(owner ? [eq(deals.ownerUserId, owner)] : [])))
    .orderBy(desc(deals.createdAt));
  return rows.map(parse);
};

export const actAsPerformer = async (performerUserId: string, id: string, action: PerformerAction, stageId: string | undefined, now = Date.now()): Promise<Deal | string | null> => {
  const [row] = await getDb().select().from(deals).where(and(eq(deals.id, id), eq(deals.performerId, `me-${performerUserId}`))).limit(1);
  if (!row) return null;
  const result = applyPerformerAction(parse(row), action, stageId, now);
  if (typeof result === "string") return result;
  await write(row.ownerUserId, result, now);
  return result;
};

// ───────────── умови з розмови (без запиту) ─────────────

const MAX_LIVE_DIRECT = 5;

/**
 * Умови, виставлені прямо в розмові: назва, опис, сума, етапи. Виставити може
 * будь-яка сторона; власник угоди завжди замовник, а `proposedBy` каже, хто чекає відповіді.
 */
export const proposeDirectDeal = async (
  conversation: { id: string; customerUserId: string; performerId: string },
  proposedBy: "customer" | "performer",
  draft: Omit<DealDraft, "requestId" | "responseId" | "conversationId" | "proposedBy">,
  now = Date.now(),
): Promise<Deal | string> => {
  const title = draft.title?.trim() ?? "";
  if (title.length < 2) return "Назвіть замовлення: хоча б кілька літер.";
  if (title.length > 80) return "Назва задовга: до 80 символів.";
  if ((draft.description?.length ?? 0) > 1000) return "Опис задовгий: до 1000 символів.";
  const full: DealDraft = { ...draft, title, requestId: directRequestId(conversation.id), responseId: DIRECT_RESPONSE_ID, conversationId: conversation.id, proposedBy };
  const error = validateDraft(full);
  if (error) return error;
  const live = (await readAll(conversation.customerUserId)).filter((deal) => deal.conversationId === conversation.id && (deal.status === "proposed" || deal.status === "accepted"));
  if (live.length >= MAX_LIVE_DIRECT) return `У розмові вже ${MAX_LIVE_DIRECT} відкритих замовлень: завершіть одне, щоб додати нове.`;
  const deal = createDeal(`deal_${crypto.randomUUID().slice(0, 8)}`, full, now);
  await getDb().insert(deals).values({
    id: deal.id,
    ownerUserId: conversation.customerUserId,
    requestId: deal.requestId,
    responseId: deal.responseId,
    performerId: deal.performer.id,
    status: deal.status,
    data: JSON.stringify(deal),
    createdAt: now,
    updatedAt: now,
  });
  return deal;
};

// ───────────── модератор ─────────────

export interface ModeratorDecision {
  deal: Deal;
  stage: DealStage;
  ownerUserId: string;
  decisionId: string;
}

/**
 * Рішення модератора у спорі: машина змінює угоду, запис у журнал лишається назавжди.
 * Оновлення з перевіркою `updated_at`: якщо угоду в цей час змінили (друга людина
 * вирішила спір, сторона діяла), нічого не пишемо й просимо оновити сторінку.
 */
export const actAsModerator = async (
  id: string,
  action: ModeratorAction,
  stageId: string | undefined,
  admin: { userId: string; email: string; comment: string },
  now = Date.now(),
): Promise<ModeratorDecision | string | null> => {
  const db = getDb();
  const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!row) return null;
  const before = parse(row);
  const result = applyModeratorAction(before, action, stageId, now);
  if (typeof result === "string") return result;
  const target = stageId ? before.stages.find((item) => item.id === stageId) : disputedStage(before);
  if (!target) return "Етапу не знайдено.";
  const claimed = await db
    .update(deals)
    .set({ status: result.status, data: JSON.stringify(result), updatedAt: now })
    .where(and(eq(deals.id, id), eq(deals.updatedAt, row.updatedAt)))
    .returning({ id: deals.id });
  if (claimed.length === 0) return "Угоду щойно змінили: оновіть сторінку й перегляньте її знову.";
  const decisionId = `mod_${crypto.randomUUID().slice(0, 10)}`;
  await db.insert(moderationActions).values({ id: decisionId, dealId: id, stageId: target.id, action, comment: admin.comment, adminUserId: admin.userId, adminEmail: admin.email, createdAt: now });
  return { deal: result, stage: target, ownerUserId: row.ownerUserId, decisionId };
};
