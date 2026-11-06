// lib/server/review-repo.ts
import { desc, eq, inArray, sql } from "drizzle-orm";
import { reviews } from "@/db/schema";
import { averageOf, type Review } from "@/lib/reviews/types";
import { getDb, inChunks } from "./db";

const toReview = (row: typeof reviews.$inferSelect): Review => ({
  id: row.id,
  performerId: row.performerId,
  dealId: row.dealId,
  stars: row.stars as Review["stars"],
  text: row.text,
  author: row.author,
  verified: row.verified === 1,
  createdAt: new Date(row.createdAt).toISOString(),
});

export const reviewsFor = async (performerId: string): Promise<Review[]> =>
  (await getDb().select().from(reviews).where(eq(reviews.performerId, performerId)).orderBy(desc(reviews.createdAt))).map(toReview);

export type ReviewStats = { count: number; average: number | null };

/** Середня оцінка й кількість відгуків кількох виконавців: агрегат із групуванням, відгуки не вантажимо. Без відгуків запису в мапі немає. */
export const reviewStatsFor = async (performerIds: string[]): Promise<Map<string, ReviewStats>> => {
  const rows = await inChunks([...new Set(performerIds)], (chunk) =>
    getDb()
      .select({ performerId: reviews.performerId, count: sql<number>`count(*)`, sum: sql<number>`sum(${reviews.stars})` })
      .from(reviews)
      .where(inArray(reviews.performerId, chunk))
      .groupBy(reviews.performerId),
  );
  return new Map(rows.map((row) => [row.performerId, { count: Number(row.count), average: averageOf(Number(row.sum), Number(row.count)) }]));
};

/** Середня оцінка й кількість відгуків виконавця. */
export const getReviewStats = async (performerId: string): Promise<ReviewStats> => (await reviewStatsFor([performerId])).get(performerId) ?? { count: 0, average: null };

export const reviewOfDeal = async (dealId: string): Promise<Review | undefined> => {
  const [row] = await getDb().select().from(reviews).where(eq(reviews.dealId, dealId)).limit(1);
  return row ? toReview(row) : undefined;
};

export const addReview = async (authorUserId: string, review: Omit<Review, "id" | "createdAt" | "verified"> & { verified?: boolean }): Promise<Review> => {
  const row = { id: `rev_${crypto.randomUUID().slice(0, 8)}`, performerId: review.performerId, dealId: review.dealId, authorUserId, stars: review.stars, text: review.text, author: review.author, verified: review.verified ? 1 : 0, createdAt: Date.now() };
  await getDb().insert(reviews).values(row);
  return toReview(row);
};
