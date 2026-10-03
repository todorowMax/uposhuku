// lib/reviews/demo.ts
//
// Кілька вигаданих відгуків для демо-виконавців, щоб профіль не був порожнім.
// Вони позначені demo й зникнуть разом із демо-даними; справжні лежать у D1.

import type { Review } from "./types";

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
export const demoReviewsFor = (performerId: string): Review[] => {
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
