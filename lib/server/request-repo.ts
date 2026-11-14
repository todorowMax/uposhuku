// lib/server/request-repo.ts
//
// Запити замовників і відгуки виконавців на D1.

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { requestFiles, requestTags, requests, responses } from "@/db/schema";
import type { MyResponse } from "@/lib/feed/types";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";
import { RESTORE_WINDOW_MS, isDeadline } from "@/lib/requests/types";
import { newId } from "@/lib/ids";
import { getDb, inChunks } from "./db";

type Row = typeof requests.$inferSelect;

/** Кінець доби на відновлення (ms) для закритого запиту; null, якщо відновлювати нічого або вже пізно. */
const restoreDeadline = (row: Pick<Row, "status" | "closedAt">, now: number): number | null => {
  if (row.status !== "closed" || row.closedAt === null) return null;
  const until = row.closedAt + RESTORE_WINDOW_MS;
  return until > now ? until : null;
};

const restoreUntilIso = (row: Pick<Row, "status" | "closedAt">, now: number): string | null => {
  const until = restoreDeadline(row, now);
  return until === null ? null : new Date(until).toISOString();
};

const hydrate = async (rows: Row[]): Promise<PublishedRequest[]> => {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((row) => row.id);
  const [tagRows, fileRows] = await Promise.all([
    inChunks(ids, (chunk) => db.select().from(requestTags).where(inArray(requestTags.requestId, chunk))),
    inChunks(ids, (chunk) => db.select().from(requestFiles).where(inArray(requestFiles.requestId, chunk))),
  ]);
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    budget: row.budget,
    deadline: isDeadline(row.deadline) ? row.deadline : null,
    cityId: row.cityId,
    tags: tagRows.filter((tag) => tag.requestId === row.id).map((tag) => ({ id: tag.tagId, label: tag.label })),
    files: fileRows.filter((file) => file.requestId === row.id).map((file) => ({ name: file.name, size: file.size, type: file.type })),
    channelOptIn: row.channelOptIn,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    editedAt: row.editedAt === null ? null : new Date(row.editedAt).toISOString(),
    restoreUntil: restoreUntilIso(row, now),
  }));
};

export const createRequest = async (userId: string, draft: RequestDraft): Promise<PublishedRequest> => {
  const db = getDb();
  const id = newId("req");
  const statements = [
    db.insert(requests).values({ id, userId, text: draft.text, budget: draft.budget ?? null, deadline: draft.deadline ?? null, cityId: draft.cityId ?? null, status: "open", channelOptIn: draft.channelOptIn !== false, createdAt: Date.now() }),
    ...(draft.tags.length ? [db.insert(requestTags).values(draft.tags.map((tag) => ({ requestId: id, tagId: tag.id, label: tag.label })).filter((tag, index, all) => all.findIndex((other) => other.tagId === tag.tagId) === index))] : []),
    ...(draft.files.length ? [db.insert(requestFiles).values(draft.files.map((file) => ({ requestId: id, name: file.name, size: file.size, type: file.type })))] : []),
  ];
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  const [saved] = await hydrate(await db.select().from(requests).where(eq(requests.id, id)).limit(1));
  return saved;
};

export const listRequests = async (userId: string) =>
  hydrate(await getDb().select().from(requests).where(eq(requests.userId, userId)).orderBy(desc(requests.createdAt)));

/** Свій запит за id; чужий — як неіснуючий. */
export const findRequest = async (userId: string, id: string): Promise<PublishedRequest | null> => {
  const rows = await getDb().select().from(requests).where(and(eq(requests.id, id), eq(requests.userId, userId))).limit(1);
  return (await hydrate(rows))[0] ?? null;
};

/**
 * Закриває свій запит. `closed_at` ставиться лише коли запит був відкритий: повторне закриття вікно відновлення не продовжує.
 * Чужий чи неіснуючий запит дає null.
 */
export const closeRequest = async (userId: string, id: string, now = Date.now()): Promise<PublishedRequest | null> => {
  const db = getDb();
  const own = and(eq(requests.id, id), eq(requests.userId, userId));
  await db.update(requests).set({ status: "closed", closedAt: now }).where(and(own, eq(requests.status, "open")));
  return findRequest(userId, id);
};

/**
 * Відновлює свій закритий запит у межах доби від першого закриття. `createdAt`, правки, теги й файли не міняються.
 * Чужий, неіснуючий чи відкритий запит: not_found; закритий, але доба минула (або `closed_at` порожній): window_expired.
 */
export const reopenRequest = async (userId: string, id: string, now = Date.now()): Promise<PublishedRequest | "not_found" | "window_expired"> => {
  const db = getDb();
  const [row] = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.userId, userId))).limit(1);
  if (!row || row.status !== "closed") return "not_found";
  if (restoreDeadline(row, now) === null) return "window_expired";
  await db.update(requests).set({ status: "open", closedAt: null }).where(and(eq(requests.id, id), eq(requests.status, "closed")));
  return (await findRequest(userId, id)) ?? "not_found";
};

/**
 * Правка свого відкритого запиту: текст, умови, теги й файли замінюються одним пакетом; `createdAt` не змінюється,
 * тож порядок у списках лишається. Чужий чи неіснуючий запит — not_found, закритий — closed.
 */
export const updateRequest = async (userId: string, id: string, draft: RequestDraft): Promise<PublishedRequest | "not_found" | "closed"> => {
  const db = getDb();
  const now = Date.now();
  const [row] = await db.select().from(requests).where(and(eq(requests.id, id), eq(requests.userId, userId))).limit(1);
  if (!row) return "not_found";
  if (row.status !== "open") return "closed";
  const tags = draft.tags.map((tag) => ({ requestId: id, tagId: tag.id, label: tag.label })).filter((tag, index, all) => all.findIndex((other) => other.tagId === tag.tagId) === index);
  const statements = [
    db
      .update(requests)
      .set({ text: draft.text, budget: draft.budget ?? null, deadline: draft.deadline ?? null, cityId: draft.cityId ?? null, channelOptIn: draft.channelOptIn !== false, editedAt: now, editCount: row.editCount + 1 })
      .where(and(eq(requests.id, id), eq(requests.status, "open"))),
    db.delete(requestTags).where(eq(requestTags.requestId, id)),
    db.delete(requestFiles).where(eq(requestFiles.requestId, id)),
    ...(tags.length ? [db.insert(requestTags).values(tags)] : []),
    ...(draft.files.length ? [db.insert(requestFiles).values(draft.files.map((file) => ({ requestId: id, name: file.name, size: file.size, type: file.type })))] : []),
  ];
  await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
  return (await findRequest(userId, id)) ?? "not_found";
};

/** Відкриті запити інших людей: з них складається стрічка виконавця. */
export const listOthersOpen = async (exceptUserId: string) =>
  hydrate(await getDb().select().from(requests).where(and(eq(requests.status, "open"), ne(requests.userId, exceptUserId))).orderBy(desc(requests.createdAt)).limit(200));

/** Чи відкритий запит існує і чий він: потрібно для відгуків. */
export const requestOwner = async (id: string) => {
  const [row] = await getDb().select({ userId: requests.userId, status: requests.status }).from(requests).where(eq(requests.id, id)).limit(1);
  return row ?? null;
};

/** Коротко про запит для сповіщень: автор і текст. */
export const requestBrief = async (id: string) => {
  const [row] = await getDb().select({ userId: requests.userId, text: requests.text, status: requests.status, budget: requests.budget, cityId: requests.cityId }).from(requests).where(eq(requests.id, id)).limit(1);
  return row ?? null;
};

// ───────────── відгуки виконавців ─────────────

const toMine = (row: typeof responses.$inferSelect): MyResponse => ({ price: row.price, days: row.days, message: row.message, createdAt: new Date(row.createdAt).toISOString() });

/** Усі мої відгуки: requestId → відгук. */
export const myResponses = async (userId: string): Promise<Map<string, MyResponse>> => {
  const rows = await getDb().select().from(responses).where(eq(responses.performerUserId, userId));
  return new Map(rows.map((row) => [row.requestId, toMine(row)]));
};

export const saveResponse = async (userId: string, requestId: string, value: Omit<MyResponse, "createdAt">): Promise<MyResponse> => {
  const db = getDb();
  const now = Date.now();
  await db
    .insert(responses)
    .values({ id: `resp_${crypto.randomUUID().slice(0, 8)}`, requestId, performerUserId: userId, price: value.price, days: value.days, message: value.message, createdAt: now })
    .onConflictDoUpdate({ target: [responses.requestId, responses.performerUserId], set: { price: value.price, days: value.days, message: value.message } });
  const [row] = await db.select().from(responses).where(and(eq(responses.requestId, requestId), eq(responses.performerUserId, userId))).limit(1);
  return toMine(row);
};

export const removeResponse = async (userId: string, requestId: string) => {
  await getDb().delete(responses).where(and(eq(responses.requestId, requestId), eq(responses.performerUserId, userId)));
};

/** Скільки відгуків на один запит показуємо замовнику; решту (понад стелю) відсікаємо. */
export const RESPONSES_CAP = 200;

/**
 * Справжні відгуки виконавців на запит: хто відповів і що. Для пропозицій замовника.
 * Не більше RESPONSES_CAP, найраніші першими (серед однакових за часом за id), тож вибірка стабільна.
 */
export const responsesTo = async (requestId: string): Promise<{ userId: string; response: MyResponse }[]> =>
  (await getDb().select().from(responses).where(eq(responses.requestId, requestId)).orderBy(asc(responses.createdAt), asc(responses.id)).limit(RESPONSES_CAP)).map((row) => ({ userId: row.performerUserId, response: toMine(row) }));

/** Скільки справжніх відгуків на кожен із запитів. */
export const responseCounts = async (requestIds: string[]): Promise<Map<string, number>> => {
  if (requestIds.length === 0) return new Map();
  const rows = await inChunks(requestIds, (chunk) => getDb().select({ requestId: responses.requestId }).from(responses).where(inArray(responses.requestId, chunk)));
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.requestId, (counts.get(row.requestId) ?? 0) + 1);
  return counts;
};
