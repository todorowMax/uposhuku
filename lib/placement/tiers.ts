// lib/placement/tiers.ts
//
// Рівні розміщення на карті. Оплата разова, від 100 ₴, усім однаково;
// сума накопичується, тож докупити можна будь-коли, а рівень не падає.
// Без оплати — рівень 1 (найменший маркер, нижче платних у пропозиціях).
// Ціни рівнів — чернетка до обговорення: вони лежать тут одним списком.

import type { PlacementTier } from "@/lib/map/types";

export const MIN_PAYMENT = 100;
export const MAX_PAYMENT = 10_000;

/** З якої сумарної оплати починається рівень. Рівень 1 — без оплати. */
export const TIER_FROM: Record<PlacementTier, number> = { 1: 0, 2: 100, 3: 300, 4: 700, 5: 1500, 6: 3000 };

/** Розмір маркера на карті, px, і розмір у списку групи. Рівні 1–6. */
export const TIER_PX = [25, 29, 33, 37, 42, 48] as const;

export const TIER_NAMES: Record<PlacementTier, string> = {
  1: "Базовий",
  2: "Старт",
  3: "Помітний",
  4: "Вище",
  5: "Топ",
  6: "Найбільший",
};

export const PAID_TIERS: PlacementTier[] = [2, 3, 4, 5, 6];
export const PACKAGES = [100, 300, 700, 1500, 3000] as const;

export const tierForTotal = (total: number): PlacementTier => {
  let result: PlacementTier = 1;
  for (const tier of [2, 3, 4, 5, 6] as PlacementTier[]) if (total >= TIER_FROM[tier]) result = tier;
  return result;
};

/** Скільки докласти до наступного рівня; null на найвищому. */
export const toNextTier = (total: number): { tier: PlacementTier; extra: number } | null => {
  const current = tierForTotal(total);
  if (current === 6) return null;
  const next = (current + 1) as PlacementTier;
  return { tier: next, extra: TIER_FROM[next] - total };
};

export const isPromoted = (tier: number) => tier >= 2;

/** «З цією сумою ви вище за N з M»: скільки людей на нижчому рівні. */
export const outrank = (tier: PlacementTier, others: { tier: number }[]) => others.filter((person) => person.tier < tier).length;
