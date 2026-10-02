// lib/reviews/mock-store.ts
//
// Відгуки в пам'яті сервера, поки немає D1 (таблиця reviews). Для
// демо-виконавців додаємо кілька вигаданих, щоб профіль не був порожнім:
// вони позначені demo і зникнуть разом із демо-даними.

import type { Review } from "./types";

const store = globalThis as typeof globalThis & { __vmReviews?: Review[] };
const all = (): Review[] => (store.__vmReviews ??= []);

const DEMO_TEXTS = [
  "Зробила швидко й охайно, усе пояснювала по ходу. Рекомендую.",
  "Домовились чітко, терміни дотримано. Були правки, внесла без проблем.",
  "Хороша комунікація, результат навіть кращий, ніж очікував.",
  "Добре розуміє бізнес-задачу, а не просто виконує ТЗ.",
  "Трохи затримали першу версію, але фінал якісний.",
];
const DEMO_AUTHORS = ["Олексій", "Марина", "Андрій", "Наталія", "Денис", "Ірина"];

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

/** Кілька вигаданих відгуків для демо-виконавця; стабільні для людини. */
const demoFor = (performerId: string): Review[] => {
  const count = 2 + (hash(`${performerId}:n`) % 3);
  return Array.from({ length: count }, (_, index) => {
    const seed = hash(`${performerId}:${index}`);
    return {
      id: `demo-${performerId}-${index}`,
      performerId,
      dealId: `demo-${index}`,
      stars: (seed % 5 === 0 ? 4 : 5) as Review["stars"],
      text: DEMO_TEXTS[seed % DEMO_TEXTS.length],
      author: DEMO_AUTHORS[(seed >> 3) % DEMO_AUTHORS.length],
      createdAt: new Date(Date.parse("2026-09-10T10:00:00Z") - index * 9 * 86_400_000).toISOString(),
      demo: true,
    };
  });
};

export const reviewsFor = (performerId: string): Review[] =>
  [...all().filter((review) => review.performerId === performerId), ...(performerId.startsWith("me-") ? [] : demoFor(performerId))].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

export const reviewOfDeal = (dealId: string): Review | undefined => all().find((review) => review.dealId === dealId);

export const addReview = (review: Omit<Review, "id" | "createdAt">): Review => {
  const saved: Review = { ...review, id: `rev_${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() };
  all().unshift(saved);
  return saved;
};
