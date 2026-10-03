// lib/server/review-repo.ts
import { desc, eq } from "drizzle-orm";
import { reviews } from "@/db/schema";
import { averageStars, type Review } from "@/lib/reviews/types";
import { getDb } from "./db";

const toReview = (row: typeof reviews.$inferSelect): Review => ({
  id: row.id,
  performerId: row.performerId,
  dealId: row.dealId,
  stars: row.stars as Review["stars"],
  text: row.text,
  author: row.author,
  createdAt: new Date(row.createdAt).toISOString(),
});

export const reviewsFor = async (performerId: string): Promise<Review[]> =>
  (await getDb().select().from(reviews).where(eq(reviews.performerId, performerId)).orderBy(desc(reviews.createdAt))).map(toReview);

/** Середня оцінка й кількість відгуків виконавця. */
export const getReviewStats = async (performerId: string) => {
  const list = await reviewsFor(performerId);
  return { count: list.length, average: averageStars(list) };
};

export const reviewOfDeal = async (dealId: string): Promise<Review | undefined> => {
  const [row] = await getDb().select().from(reviews).where(eq(reviews.dealId, dealId)).limit(1);
  return row ? toReview(row) : undefined;
};

export const addReview = async (authorUserId: string, review: Omit<Review, "id" | "createdAt">): Promise<Review> => {
  const row = { id: `rev_${crypto.randomUUID().slice(0, 8)}`, performerId: review.performerId, dealId: review.dealId, authorUserId, stars: review.stars, text: review.text, author: review.author, createdAt: Date.now() };
  await getDb().insert(reviews).values(row);
  return toReview(row);
};
