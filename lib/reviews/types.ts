// lib/reviews/types.ts
//
// Відгук про роботу: лишити його може лише замовник із завершеною угодою,
// один на угоду (так не накрутити). Лежить у профілі виконавця.

export interface Review {
  id: string;
  performerId: string;
  dealId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text: string;
  /** Ім'я автора: перше слово імені або початок пошти. */
  author: string;
  /** Оплату угоди підтвердив банк чи блокчейн: «Перевірена угода». Старі відгуки без позначки. */
  verified: boolean;
  createdAt: string;
}

export const REVIEW_TEXT_MAX = 600;

/** Середня з сум і кількості до десятих; null, якщо відгуків немає. */
export const averageOf = (sum: number, count: number): number | null => (count ? Math.round((sum / count) * 10) / 10 : null);

export const averageStars = (reviews: Pick<Review, "stars">[]): number | null => averageOf(reviews.reduce((sum, review) => sum + review.stars, 0), reviews.length);
