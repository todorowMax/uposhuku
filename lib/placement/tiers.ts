// lib/placement/tiers.ts
//
// Рівні розміщення на карті. Оплата разова, від 100 ₴; сума накопичується.
// Без оплати — рівень 1: людину не видно на карті, а її відгуки стоять
// нижче платних. Ціни рівнів динамічні, їх рахує pricing.ts.

import type { PlacementTier } from "@/lib/map/types";

export { MAX_PAYMENT, MIN_PAYMENT } from "./pricing";

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

export const isPromoted = (tier: number) => tier >= 2;

/** «З цією сумою ви вище за N з M»: скільки людей на нижчому рівні. */
export const outrank = (tier: PlacementTier, others: { tier: number }[]) => others.filter((person) => person.tier < tier).length;
