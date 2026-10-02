// lib/placement/types.ts
//
// Оплати розміщення: контракт сервера й клієнта.

import type { PlacementTier } from "@/lib/map/types";

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
  tier: PlacementTier;
  payments: Payment[];
}

/** Як закінчився тестовий платіж. Лише в заглушці: справжній приходить вебхуком Monobank. */
export type PaymentOutcome = "success" | "declined";
