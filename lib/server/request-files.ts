// lib/server/request-files.ts
//
// Файли запиту в R2. Завантаження йде до збереження запиту (рядок без `request_id`), запит потім «забирає» файли за
// id (`createRequest`, `updateRequest`). Читає файл автор запиту, виконавець з опублікованим профілем, поки запит
// відкритий, і виконавець, що вже відгукнувся (і після закриття). Решта, зокрема гість, отримує 404.
// Ключ у R2 це `requests/<uuid>.<ext>` без імені чи id людини.

import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { profiles, requestFiles, requests, responses } from "@/db/schema";
import {
  REQUEST_FILES_MAX,
  REQUEST_FILES_PENDING_MAX,
  REQUEST_FILES_TOTAL_BYTES,
  REQUEST_FILE_MAX_BYTES,
  REQUEST_FILE_ORPHAN_MS,
  detectRequestFile,
  formatFileSize,
  sanitizeFileName,
} from "@/lib/requests/file-types";
import type { RequestFile, RequestFileRef } from "@/lib/requests/types";
import { logServer } from "@/lib/telemetry/log";
import { getDb } from "./db";
import { getBucket } from "./uploads";

export const REQUEST_FILE_PREFIX = "requests/";

type Row = typeof requestFiles.$inferSelect;

export const toRequestFile = (row: Row): RequestFile => ({ id: row.id, name: row.name, size: row.size, type: row.type, stored: row.key !== null });

/** Прибирає файли з R2: збій лише пишемо, бо рядок у базі вже зник, а чужим цей ключ недоступний. */
export const deleteRequestFileKeys = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  try {
    await getBucket().delete(keys);
  } catch (error) {
    logServer({ level: "warn", event: "request_file_delete_failed", message: error instanceof Error ? error.message : String(error), detail: { count: keys.length } });
  }
};

/** Осиротілі файли цієї людини (завантажені, але не додані до запиту понад добу): R2 і рядок. */
const dropStale = async (userId: string, now: number): Promise<void> => {
  const db = getDb();
  const stale = await db
    .select({ id: requestFiles.id, key: requestFiles.key })
    .from(requestFiles)
    .where(and(eq(requestFiles.uploaderUserId, userId), isNull(requestFiles.requestId), lt(requestFiles.createdAt, now - REQUEST_FILE_ORPHAN_MS)));
  if (stale.length === 0) return;
  await deleteRequestFileKeys(stale.flatMap((row) => (row.key ? [row.key] : [])));
  await db.delete(requestFiles).where(inArray(requestFiles.id, stale.map((row) => row.id)));
};

/** Приймає файл від автора до збереження запиту. Рядок у відповіді це причина відмови. */
export const saveRequestFile = async (userId: string, upload: { name: string; bytes: Uint8Array }, now = Date.now()): Promise<RequestFile | string> => {
  const { bytes } = upload;
  if (bytes.length === 0) return "Порожній файл.";
  if (bytes.length > REQUEST_FILE_MAX_BYTES) return `Файл завеликий: до ${formatFileSize(REQUEST_FILE_MAX_BYTES)}.`;
  const name = sanitizeFileName(upload.name);
  const detected = detectRequestFile(name, bytes);
  if (!detected) return "Такий файл не приймаємо. Можна зображення, PDF, документи Office, ZIP, текст і код.";
  await dropStale(userId, now);
  const db = getDb();
  const pending = await db.select({ id: requestFiles.id }).from(requestFiles).where(and(eq(requestFiles.uploaderUserId, userId), isNull(requestFiles.requestId)));
  if (pending.length >= REQUEST_FILES_PENDING_MAX) return "Забагато файлів, які ще не додано до запиту. Збережіть запит або приберіть зайві.";
  const key = `${REQUEST_FILE_PREFIX}${crypto.randomUUID()}.${detected.ext}`;
  await getBucket().put(key, bytes, { httpMetadata: { contentType: detected.mime, cacheControl: "private, no-store" } });
  const [row] = await db.insert(requestFiles).values({ requestId: null, name, size: bytes.length, type: detected.mime, key, uploaderUserId: userId, createdAt: now }).returning();
  return toRequestFile(row);
};

/** Прибирає файл, який людина завантажила, але ще не додала до запиту. Файл збереженого запиту знімається правкою запиту. */
export const deletePendingRequestFile = async (userId: string, id: number): Promise<boolean> => {
  const db = getDb();
  const [row] = await db.select().from(requestFiles).where(and(eq(requestFiles.id, id), eq(requestFiles.uploaderUserId, userId), isNull(requestFiles.requestId))).limit(1);
  if (!row) return false;
  await db.delete(requestFiles).where(eq(requestFiles.id, id));
  if (row.key) await deleteRequestFileKeys([row.key]);
  return true;
};

/**
 * Чи можна зберегти запит із цими файлами: кожен мій і ще не прикріплений (або вже цього запиту), разом не більше стелі.
 * `requestId` порожній при публікації. Рядок у відповіді це причина відмови, null означає «можна».
 */
export const checkDraftFiles = async (userId: string, requestId: string | null, refs: RequestFileRef[]): Promise<string | null> => {
  if (refs.length === 0) return null;
  if (refs.length > REQUEST_FILES_MAX) return `До ${REQUEST_FILES_MAX} файлів у запиті.`;
  const rows = await getDb()
    .select()
    .from(requestFiles)
    .where(inArray(requestFiles.id, refs.map((ref) => ref.id)));
  const usable = rows.filter((row) => (row.requestId === null ? row.uploaderUserId === userId : requestId !== null && row.requestId === requestId));
  if (usable.length !== refs.length) return "Один із файлів уже недоступний. Додайте його знову.";
  if (usable.reduce((sum, row) => sum + row.size, 0) > REQUEST_FILES_TOTAL_BYTES) return `Файли разом завеликі: до ${formatFileSize(REQUEST_FILES_TOTAL_BYTES)}.`;
  return null;
};

/** Файл, який цей глядач має право читати, або null (нема, чужий, закритий запит без відгуку, не опублікований профіль). */
export const readableRequestFile = async (viewerId: string, id: number): Promise<Row | null> => {
  const db = getDb();
  const [file] = await db.select().from(requestFiles).where(eq(requestFiles.id, id)).limit(1);
  if (!file?.key) return null;
  if (file.requestId === null) return file.uploaderUserId === viewerId ? file : null;
  const [request] = await db.select({ userId: requests.userId, status: requests.status }).from(requests).where(eq(requests.id, file.requestId)).limit(1);
  if (!request) return null;
  if (request.userId === viewerId) return file;
  const [responded] = await db.select({ id: responses.id }).from(responses).where(and(eq(responses.requestId, file.requestId), eq(responses.performerUserId, viewerId))).limit(1);
  if (responded) return file;
  if (request.status !== "open") return null;
  const [profile] = await db.select({ published: profiles.published }).from(profiles).where(eq(profiles.userId, viewerId)).limit(1);
  return profile?.published ? file : null;
};
