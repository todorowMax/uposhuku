// lib/placement/pricing.ts
//
// Динамічні ціни рівнів. Мінімум 100 ₴ завжди той самий: це вхід на карту.
// Решта залежить від того, скільки вже заплатили інші: щоб потрапити в
// найбільший маркер, треба заплатити більше, ніж платить верхня частина
// виконавців. Рівень тримається, поки вас не перебили.
//
// Чиста функція без сервера й браузера: ті самі числа рахує бекенд, а
// клієнт лише показує готові ціни з відповіді /api/placement.

import type { PlacementTier } from "@/lib/map/types";

export const MIN_PAYMENT = 100;
export const MAX_PAYMENT = 10_000;

export type PaidTier = 2 | 3 | 4 | 5 | 6;
/** Скільки сумарно треба заплатити, щоб зараз стояти на цьому рівні. */
export type TierPrices = Record<PaidTier, number>;

/** Нижня межа цін: навіть якщо ніхто не платить, найбільший маркер не коштує копійки. */
export const TIER_FLOOR: TierPrices = { 2: MIN_PAYMENT, 3: 300, 4: 700, 5: 1500, 6: 3000 };

/**
 * Яка частка тих, хто платить, стоїть на рівні й вище. Найбільший маркер
 * лишається рідкістю (8%), найменший платний тримає решту.
 */
const SHARE_AT_OR_ABOVE: Record<3 | 4 | 5 | 6, number> = { 3: 0.63, 4: 0.38, 5: 0.2, 6: 0.08 };

/** Мінімальний крок між цінами сусідніх рівнів. */
const STEP = 50;

const ceilTo = (value: number, unit: number) => Math.ceil(value / unit) * unit;

/**
 * Ціни рівнів для людини, яка дивиться на інших. `others` — сумарні оплати
 * решти виконавців. Щоб увійти у верхні `c` місць, треба заплатити більше,
 * ніж людина на місці `c`; якщо платників менше, діє нижня межа.
 */
export const quote = (others: number[]): TierPrices => {
  const sorted = others.filter((total) => total >= MIN_PAYMENT).sort((a, b) => b - a);
  const prices = { 2: MIN_PAYMENT } as TierPrices;
  for (const tier of [3, 4, 5, 6] as const) {
    const places = Math.max(1, Math.round(SHARE_AT_OR_ABOVE[tier] * (sorted.length + 1)));
    const toBeat = places <= sorted.length ? sorted[places - 1] + 1 : 0;
    const raw = ceilTo(Math.max(TIER_FLOOR[tier], toBeat), 10);
    prices[tier] = Math.max(raw, prices[(tier - 1) as PaidTier] + STEP);
  }
  return prices;
};

/** Рівень за сумою: найвищий, ціну якого сплачено. Менше 100 ₴ — не на карті. */
export const tierFor = (total: number, prices: TierPrices): PlacementTier => {
  let result: PlacementTier = 1;
  for (const tier of [2, 3, 4, 5, 6] as const) if (total >= prices[tier]) result = tier;
  return result;
};

/** Скільки докласти до наступного рівня; null на найвищому. */
export const toNextTier = (total: number, prices: TierPrices): { tier: PaidTier; extra: number } | null => {
  const current = tierFor(total, prices);
  if (current === 6) return null;
  const next = (current === 1 ? 2 : current + 1) as PaidTier;
  return { tier: next, extra: prices[next] - total };
};
