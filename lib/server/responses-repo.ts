// lib/server/responses-repo.ts
//
// Рішення замовника щодо відгуків: нове, у обраних, відхилено, обрано. Міняє лише автор запиту, виконавець статусу не бачить.

import { and, eq } from "drizzle-orm";
import { responses } from "@/db/schema";
import type { ResponseStatus } from "@/lib/requests/types";
import { getDb } from "./db";
import { findRequest } from "./request-repo";

/** Виконавець у відгуках має вигляд `me-<userId>`; повертає userId або null для чужого формату. */
export const performerUserId = (performerId: string): string | null => (performerId.startsWith("me-") && performerId.length > 3 ? performerId.slice(3) : null);

/**
 * Ставить статус відгуку на свій запит. Чужий чи неіснуючий запит, відгук якого немає: not_found; закритий запит: closed
 * (рішення за закритим запитом не міняємо).
 */
export const setResponseStatus = async (authorId: string, { requestId, performerId }: { requestId: string; performerId: string }, status: ResponseStatus): Promise<"ok" | "not_found" | "closed"> => {
  const request = await findRequest(authorId, requestId);
  const userId = performerUserId(performerId);
  if (!request || userId === null) return "not_found";
  if (request.status !== "open") return "closed";
  const updated = await getDb()
    .update(responses)
    .set({ status })
    .where(and(eq(responses.requestId, requestId), eq(responses.performerUserId, userId)))
    .returning({ id: responses.id });
  return updated.length > 0 ? "ok" : "not_found";
};
