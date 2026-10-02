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
  createdAt: string;
  /** Демо-відгук, не від справжньої угоди. */
  demo?: boolean;
}

export const REVIEW_TEXT_MAX = 600;

export const averageStars = (reviews: Pick<Review, "stars">[]): number | null =>
  reviews.length ? Math.round((reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length) * 10) / 10 : null;
