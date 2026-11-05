"use client";

// lib/payouts/client.ts
//
// Підключення до виплат безпечної угоди в браузері: стан своєї заявки й подання. ІПН у відповіді немає, лише маска.

import { callApi } from "@/lib/deals/client";
import type { PayoutApplication } from "@/lib/deals/payout";

export interface PayoutDto {
  status: "pending" | "active" | "rejected";
  fopName: string;
  taxIdMask: string;
  consentAt: number | null;
  checkedAt: number | null;
}

export interface PayoutStateDto {
  /** false, коли безпечна угода вимкнена: розділ не показуємо. */
  available: boolean;
  payout: PayoutDto | null;
}

export const fetchPayout = () => callApi<PayoutStateDto>("/api/payout-account");

export const submitPayoutApplication = (value: PayoutApplication) =>
  callApi<PayoutStateDto>("/api/payout-account", { method: "PUT", body: JSON.stringify({ ...value, accountConfirmed: true, consent: true }) });
