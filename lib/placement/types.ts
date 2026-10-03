// lib/placement/types.ts
//
// Оплати розміщення: контракт сервера й клієнта.

import type { PlacementTier } from "@/lib/map/types";
import type { TierPrices } from "./pricing";

export interface Payment {
  id: string;
  amount: number;
  createdAt: string;
  /** Рівень після цього платежу. */
  tierAfter: PlacementTier;
}

export interface Placement {
  /** Скільки сплачено разом. */
  total: number;
  /** Рівень зараз: з нього видно, чи вас не перебили. Падає, якщо інші заплатили більше. */
  tier: PlacementTier;
  /** Скільки сумарно треба мати, щоб зараз стояти на кожному платному рівні. */
  prices: TierPrices;
  payments: Payment[];
}

/** Як закінчився тестовий платіж. Лише в заглушці: справжній приходить вебхуком Monobank. */
export type PaymentOutcome = "success" | "declined";
