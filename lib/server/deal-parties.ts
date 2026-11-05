// lib/server/deal-parties.ts
//
// Виконавець угоди з відгуку, зібраний на сервері. Клієнт називає лише відгук, а ім'я, спеціальність
// і фото беремо з бази: підставити чужий id чи вигадане ім'я не вийде.

import { and, eq } from "drizzle-orm";
import { responses } from "@/db/schema";
import { isFop } from "@/lib/deals/fop";
import { performerIdOf, responseAuthor } from "@/lib/deals/parties";
import type { DealParty } from "@/lib/deals/types";
import { getDb } from "./db";
import { getProfile } from "./profile-repo";
import { SELF_DEAL } from "./deal-repo";

const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const PHOTO_MAX = 300_000;

/**
 * Виконавець за відгуком на запит замовника або текст помилки. Відгук має належати цьому запиту,
 * а `claimedPerformerId` (що прислав клієнт) збігатися з автором відгуку. Демо-виконавців тут немає:
 * угоди за відгуками бувають лише з справжніми акаунтами (див. lib/requests/responses.ts).
 */
export const performerFromResponse = async (customerUserId: string, input: { requestId: string; responseId: string; claimedPerformerId: string }): Promise<DealParty | string> => {
  const author = responseAuthor(input.requestId, input.responseId);
  if (!author) return "Відгук не належить цьому запиту.";
  if (author === customerUserId) return SELF_DEAL;
  const [response] = await getDb().select({ id: responses.id }).from(responses).where(and(eq(responses.requestId, input.requestId), eq(responses.performerUserId, author))).limit(1);
  if (!response) return "Відгуку не знайдено.";
  if (input.claimedPerformerId !== performerIdOf(author)) return "Виконавець не збігається з відгуком.";
  const profile = await getProfile(author);
  if (!profile?.published) return "Виконавець зараз недоступний.";
  const id = performerIdOf(author);
  return {
    id,
    name: profile.name,
    photo: PHOTO_PATTERN.test(profile.photo) && profile.photo.length < PHOTO_MAX ? profile.photo : undefined,
    avatarIndex: 0,
    specialty: profile.specialty,
    fop: isFop(id),
  };
};
