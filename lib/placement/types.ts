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

/** Рахунок Monobank, на сторінку оплати якого ведемо людину. */
export interface PlacementInvoice {
  id: string;
  pageUrl: string;
}

/** Статуси рахунку від банку; фінальні: success, failure, expired, reversed. */
export type InvoiceStatus = "created" | "processing" | "hold" | "success" | "failure" | "reversed" | "expired";

export interface InvoiceCheck {
  status: InvoiceStatus;
  placement: Placement;
}
