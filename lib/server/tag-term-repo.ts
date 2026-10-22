// lib/server/tag-term-repo.ts
//
// Лічильник слів із запитів, яких словник не знає (tag_term_stats). Без
// прив'язки до людини чи запиту. Одноразові слова (імена, випадкові
// помилки) через 30 днів прибираємо: там осідає все особисте.

import { and, eq, lt, sql } from "drizzle-orm";
import { tagTermStats } from "@/db/schema";
import { unknownTerms } from "@/lib/tags/unknown-terms";
import { getDb } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TERM_ONCE_RETENTION_MS = 30 * DAY_MS;
const PRUNE_CHANCE = 0.02;

/** Зараховує слова запиту. Нічого не кидає: рахунок не має ламати публікацію запиту. */
export const recordUnknownTerms = async (text: string): Promise<number> => {
  try {
    const terms = unknownTerms(text);
    if (terms.length === 0) return 0;
    const db = getDb();
    const now = Date.now();
    for (const term of terms) {
      await db
        .insert(tagTermStats)
        .values({ termKey: term.key, sample: term.sample, requests: 1, firstSeen: now, lastSeen: now })
        .onConflictDoUpdate({ target: tagTermStats.termKey, set: { requests: sql`${tagTermStats.requests} + 1`, lastSeen: now } });
    }
    if (Math.random() < PRUNE_CHANCE) await pruneTermStats(now);
    return terms.length;
  } catch {
    return 0;
  }
};

export const pruneTermStats = async (now = Date.now()): Promise<void> => {
  await getDb()
    .delete(tagTermStats)
    .where(and(eq(tagTermStats.requests, 1), lt(tagTermStats.lastSeen, now - TERM_ONCE_RETENTION_MS)));
};
