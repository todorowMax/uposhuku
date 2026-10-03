// lib/placement/market.ts
//
// Скільки платять інші. Поки профілів у базі немає, «інші» — це демо-виконавці
// (їхній рівень перетворюємо на правдоподібну суму) плюс справжні акаунти,
// які вже платили в цій сесії сервера. З базою сюди прийде запит
// `SELECT total FROM placements WHERE user_id != ?`.

import { DEMO_PERFORMERS } from "@/lib/map/demo";
import { TIER_FLOOR, type PaidTier } from "./pricing";

/** Ширина діапазону сум, з якого береться демо-оплата рівня. */
const SPAN: Record<PaidTier, number> = { 2: 350, 3: 700, 4: 1200, 5: 2200, 6: 5000 };

const hash = (value: string): number => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 2 ** 32;
};

/** Суми демо-виконавців: діапазони сусідніх рівнів трохи перекриваються, як у живому ринку. Стабільні між запитами. */
export const demoTotals = (): number[] =>
  DEMO_PERFORMERS.filter((person) => person.tier >= 2).map((person) => {
    const tier = person.tier as PaidTier;
    return TIER_FLOOR[tier] + Math.floor(hash(person.id) * SPAN[tier]);
  });
