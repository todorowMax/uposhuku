// lib/server/deal-repo.ts
//
// Угоди на D1. Угода — документ (JSON з етапами), бо машина станів
// (lib/deals/machine.ts) працює з усім об'єктом.

import { and, desc, eq } from "drizzle-orm";
import { deals, moderationActions } from "@/db/schema";
import { applyAction, applyModeratorAction, applyPerformerAction, createDeal, disputedStage, validateDraft, withPaidVia } from "@/lib/deals/machine";
import type { PaymentMethod } from "@/lib/deals/requisites";
import { DIRECT_RESPONSE_ID, directRequestId, type Deal, type DealAction, type DealDraft, type DealStage, type ModeratorAction, type PerformerAction } from "@/lib/deals/types";
import { conversations } from "@/db/schema";
import { performerIdOf, performerUserId } from "@/lib/deals/parties";
import { getDb } from "./db";
import { snapshotDealRequisites } from "./requisites-repo";

/** Відповідь на спробу укласти угоду із самим собою. */
export const SELF_DEAL = "З собою угоду оформити не можна.";

/** Прийнята угода (прямий переказ чи ескроу) фіксує реквізити виконавця; для ескроу з них береться підтверджена адреса гаманця. Збій знімка не ламає прийняття: його довзяти при першому читанні. */
const snapshotOnAccept = async (deal: Deal, now: number) => {
  const performerUser = performerUserId(deal.performer.id);
  if (deal.method === "safe" || deal.status !== "accepted" || !performerUser) return;
  try {
    await snapshotDealRequisites(deal.id, performerUser, now);
  } catch (error) {
    console.error("requisites snapshot failed", error instanceof Error ? error.message : "unknown");
  }
};

const parse = (row: typeof deals.$inferSelect) => JSON.parse(row.data) as Deal;

/** Відповідь, коли угоду встигли змінити між читанням і записом. Нічого не перезаписано. */
export const DEAL_CONFLICT = "Угоду щойно змінили: оновіть сторінку й спробуйте знову.";

/** Мітка нового запису завжди більша за стару, навіть у ту саму мілісекунду: інакше перевірка updated_at нічого б не ловила. */
const stampAfter = (row: { updatedAt: number }, now: number) => Math.max(now, row.updatedAt + 1);

/**
 * Записує угоду лише якщо рядок не змінювали з моменту читання (`updated_at` той самий). false означає
 * конфлікт: перезапису не було. Усі записи угод ідуть цим шляхом.
 */
const writeGuarded = async (row: typeof deals.$inferSelect, deal: Deal, now: number): Promise<boolean> => {
  const written = await getDb()
    .update(deals)
    .set({ status: deal.status, data: JSON.stringify(deal), updatedAt: stampAfter(row, now) })
    .where(and(eq(deals.id, row.id), eq(deals.updatedAt, row.updatedAt)))
    .returning({ id: deals.id });
  return written.length > 0;
};

const readRow = async (id: string): Promise<typeof deals.$inferSelect | null> => (await getDb().select().from(deals).where(eq(deals.id, id)).limit(1))[0] ?? null;

/** Зміна угоди для системних кроків: нову угоду, текст помилки або undefined (змінювати нічого). */
export type DealChange = (deal: Deal) => Deal | string | undefined;

/**
 * Змінює угоду за id з повтором при конфлікті: вебхук і sweep не можуть попросити оновити сторінку, тож
 * перечитують угоду й застосовують зміну знову (вона дивиться на свіжий стан, а не перезаписує його).
 * null, якщо угоди немає; рядок, якщо зміну відхилено; {changed:false}, якщо змінювати нічого.
 */
export const mutateDeal = async (id: string, change: DealChange, now = Date.now()): Promise<{ deal: Deal; changed: boolean } | string | null> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await readRow(id);
    if (!row) return null;
    const before = parse(row);
    const next = change(before);
    if (next === undefined) return { deal: before, changed: false };
    if (typeof next === "string") return next;
    if (await writeGuarded(row, next, now)) return { deal: next, changed: true };
  }
  return DEAL_CONFLICT;
};

const readAll = async (userId: string): Promise<Deal[]> =>
  (await getDb().select().from(deals).where(eq(deals.ownerUserId, userId)).orderBy(desc(deals.createdAt))).map(parse);

export const listDeals = async (userId: string, requestId?: string): Promise<Deal[]> =>
  (await readAll(userId)).filter((deal) => !requestId || deal.requestId === requestId);

export const proposeDeal = async (userId: string, draft: DealDraft, options: { safeEnabled: boolean; escrowMax?: number | null; now?: number }): Promise<Deal | string> => {
  const now = options.now ?? Date.now();
  const error = validateDraft(draft, options.safeEnabled, options.escrowMax ?? null);
  if (error) return error;
  if (draft.performer.id === performerIdOf(userId)) return SELF_DEAL;
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

/** Дія замовника. Читаємо одну угоду, пишемо з перевіркою `updated_at`: двоє одночасних натискань не перезапишуть одне одного. */
export const actOnDeal = async (userId: string, id: string, action: DealAction, stageId: string | undefined, now = Date.now()): Promise<Deal | string | null> => {
  const row = await readRow(id);
  if (!row || row.ownerUserId !== userId) return null;
  const result = applyAction(parse(row), action, stageId, now);
  if (typeof result === "string") return result;
  if (!(await writeGuarded(row, result, now))) return DEAL_CONFLICT;
  if (action === "accept") await snapshotOnAccept(result, now);
  return result;
};

/** «Я оплатив(ла)» у прямому переказі: те саме, що claim_paid, плюс спосіб оплати в етапі (його вже перевірив виклик). */
export const claimDirectPayment = async (input: { userId: string; dealId: string; stageId?: string; via?: PaymentMethod; now?: number }): Promise<Deal | string | null> => {
  const { userId, dealId, stageId, via, now = Date.now() } = input;
  const row = await readRow(dealId);
  if (!row || row.ownerUserId !== userId) return null;
  const result = applyAction(parse(row), "claim_paid", stageId, now);
  if (typeof result === "string") return result;
  const target = stageId ?? result.stages.find((stage) => stage.status === "claimed")?.id;
  const withVia = via && target ? withPaidVia(result, target, via) : result;
  return (await writeGuarded(row, withVia, now)) ? withVia : DEAL_CONFLICT;
};

/** Угода замовника за id (одна, не весь список) або null. */
export const getDealForOwner = async (id: string, ownerUserId: string): Promise<Deal | null> => {
  const row = await readRow(id);
  return row && row.ownerUserId === ownerUserId ? parse(row) : null;
};

/** Угода за id без прив'язки до власника: для модератора, якому треба знати спосіб оплати до рішення. */
export const getDealById = async (id: string): Promise<Deal | null> => {
  const row = await readRow(id);
  return row ? parse(row) : null;
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
  if (!(await writeGuarded(row, result, now))) return DEAL_CONFLICT;
  if (action === "accept") await snapshotOnAccept(result, now);
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
  options: { safeEnabled: boolean; escrowMax?: number | null; now?: number },
): Promise<Deal | string> => {
  const now = options.now ?? Date.now();
  if (conversation.performerId === performerIdOf(conversation.customerUserId)) return SELF_DEAL;
  const title = draft.title?.trim() ?? "";
  if (title.length < 2) return "Назвіть замовлення: хоча б кілька літер.";
  if (title.length > 80) return "Назва задовга: до 80 символів.";
  if ((draft.description?.length ?? 0) > 1000) return "Опис задовгий: до 1000 символів.";
  const full: DealDraft = { ...draft, title, requestId: directRequestId(conversation.id), responseId: DIRECT_RESPONSE_ID, conversationId: conversation.id, proposedBy };
  const error = validateDraft(full, options.safeEnabled, options.escrowMax ?? null);
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
  admin: { userId: string; email: string; comment: string; percent?: number; confirm?: boolean },
  now = Date.now(),
): Promise<ModeratorDecision | string | null> => {
  const db = getDb();
  const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!row) return null;
  const before = parse(row);
  const result = applyModeratorAction(before, action, stageId, now, { percent: admin.percent, confirm: admin.confirm });
  if (typeof result === "string") return result;
  const target = stageId ? before.stages.find((item) => item.id === stageId) : disputedStage(before);
  if (!target) return "Етапу не знайдено.";
  if (!(await writeGuarded(row, result, now))) return DEAL_CONFLICT;
  const decisionId = `mod_${crypto.randomUUID().slice(0, 10)}`;
  // Відсоток частковості в журналі стоїть у коментарі: окремої колонки немає, а запис лишається назавжди.
  const logged = action === "partial" ? `[виплата ${admin.percent}%] ${admin.comment}` : admin.comment;
  await db.insert(moderationActions).values({ id: decisionId, dealId: id, stageId: target.id, action, comment: logged, adminUserId: admin.userId, adminEmail: admin.email, createdAt: now });
  return { deal: result, stage: target, ownerUserId: row.ownerUserId, decisionId };
};
