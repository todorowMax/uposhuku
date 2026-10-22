// lib/server/tag-proposal-repo.ts
//
// Пропозиції тегів, яких немає в словнику. Людина шукала, не знайшла й
// натиснула «Запропонувати „…“»: одна пропозиція на фразу, а хто й де просив,
// лежить окремо, щоб, коли тег з'явиться, додати його кожному.

import { and, count, eq, gt } from "drizzle-orm";
import { tagProposalUses, tagProposals } from "@/db/schema";
import { mentionsContacts } from "@/lib/chat/contacts";
import { phraseKey } from "@/lib/tags/detect";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { searchTags } from "@/lib/tags/search";
import { getDb } from "./db";

export type ProposalContext = "profile" | "work" | "request";

export const PROPOSAL_DAILY_LIMIT = 10;
export const PROPOSAL_TEXT = { min: 2, max: 40 } as const;
/** Від цього балу пошуку вважаємо, що такий тег уже є: точна назва чи синонім. */
const EXISTING_SCORE = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED = /^[\p{L}\p{N} +#.'’-]+$/u;

export type ProposeResult =
  | { kind: "proposed"; proposal: { id: string; text: string; status: "new" } }
  | { kind: "existing"; tagId: string }
  | { kind: "invalid"; message: string }
  | { kind: "limit" };

/** Чистий текст пропозиції або причина відмови. */
export const cleanProposalText = (raw: unknown): { text: string } | { error: string } => {
  if (typeof raw !== "string") return { error: "Напишіть, який тег потрібен." };
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < PROPOSAL_TEXT.min || text.length > PROPOSAL_TEXT.max) return { error: `Назва тегу від ${PROPOSAL_TEXT.min} до ${PROPOSAL_TEXT.max} символів.` };
  if (!ALLOWED.test(text) || !/\p{L}/u.test(text)) return { error: "У назві можуть бути літери, цифри й знаки + # . - '." };
  if (mentionsContacts(text) || /@|https?:|www\./i.test(text)) return { error: "Без контактів і посилань: лише назва тегу." };
  return { text };
};

export const proposeTag = async (userId: string, input: { text: unknown; context: ProposalContext; entityId?: string }): Promise<ProposeResult> => {
  const cleaned = cleanProposalText(input.text);
  if ("error" in cleaned) return { kind: "invalid", message: cleaned.error };
  const { text } = cleaned;

  // Такий тег уже є: людина просто не знайшла його за назвою.
  const found = searchTags(text, { limit: 1 })[0];
  if (found && found.score >= EXISTING_SCORE) return { kind: "existing", tagId: found.tagId };

  const db = getDb();
  const now = Date.now();
  const entityId = (input.entityId ?? "").slice(0, 80);

  const [recent] = await db
    .select({ total: count() })
    .from(tagProposalUses)
    .where(and(eq(tagProposalUses.userId, userId), gt(tagProposalUses.createdAt, now - DAY_MS)));
  if ((recent?.total ?? 0) >= PROPOSAL_DAILY_LIMIT) return { kind: "limit" };

  const key = phraseKey(text);
  if (!key) return { kind: "invalid", message: "Не вдалося розібрати назву тегу." };
  const id = `tp_${crypto.randomUUID().slice(0, 8)}`;
  // Дві людини можуть запропонувати те саме одночасно: унікальний ключ лишає одну пропозицію.
  await db.insert(tagProposals).values({ id, phraseKey: key, text, status: "new", createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [proposal] = await db.select().from(tagProposals).where(eq(tagProposals.phraseKey, key)).limit(1);
  if (!proposal) return { kind: "invalid", message: "Не вдалося зберегти пропозицію." };

  if (proposal.status === "rejected") return { kind: "invalid", message: "Такий тег ми не додаємо." };
  if ((proposal.status === "added" || proposal.status === "mapped") && proposal.resolvedTagId && TAGS_BY_ID.has(proposal.resolvedTagId)) {
    return { kind: "existing", tagId: proposal.resolvedTagId };
  }

  await db.insert(tagProposalUses).values({ proposalId: proposal.id, userId, context: input.context, entityId, createdAt: now }).onConflictDoNothing();
  return { kind: "proposed", proposal: { id: proposal.id, text: proposal.text, status: "new" } };
};

export interface PendingProposal {
  id: string;
  text: string;
  context: ProposalContext;
  entityId: string;
}

/** Мої пропозиції, які ще на розгляді. Закриті (додано, відхилено) людині вже не показуємо. */
export const listPendingProposals = async (userId: string): Promise<PendingProposal[]> => {
  const rows = await getDb()
    .select({ id: tagProposals.id, text: tagProposals.text, context: tagProposalUses.context, entityId: tagProposalUses.entityId })
    .from(tagProposalUses)
    .innerJoin(tagProposals, eq(tagProposals.id, tagProposalUses.proposalId))
    .where(and(eq(tagProposalUses.userId, userId), eq(tagProposals.status, "new")));
  return rows;
};

/** Людина передумала: прибираємо її голос. Сама пропозиція лишається, поки є бодай один голос чи ми її не закрили. */
export const removeProposalUse = async (userId: string, proposalId: string, context: ProposalContext, entityId = ""): Promise<void> => {
  await getDb()
    .delete(tagProposalUses)
    .where(and(eq(tagProposalUses.proposalId, proposalId), eq(tagProposalUses.userId, userId), eq(tagProposalUses.context, context), eq(tagProposalUses.entityId, entityId)));
};
