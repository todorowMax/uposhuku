"use client";

// lib/requisites/client.ts
//
// Реквізити для прямого переказу в браузері: свої (кабінет виконавця) і знімок за угодою.
// Значення не кладемо в спільні сховища й не пишемо в журнал.

import { callApi } from "@/lib/deals/client";
import type { Requisites } from "@/lib/deals/requisites";

export interface OwnRequisitesDto {
  requisites: Requisites | null;
  mask: string | null;
  pending: { requisites: Requisites; mask: string; effectiveAt: number } | null;
  /** Чи доступна цій людині оплата USDT: тоді в формі є адреса TRC-20 і Binance ID. */
  crypto: boolean;
}

export type SaveOutcomeDto = { kind: "saved" } | { kind: "pending"; effectiveAt: number };

export interface DealRequisitesDto {
  requisites: Requisites | null;
  mask: string | null;
  /** Чи доступна цій людині оплата USDT за хешем (прапорець `crypto_proof`). */
  crypto: boolean;
  /** Показувати QR: false на проді, поки формат НБУ не перевірено в банках. */
  qr: boolean;
}

export const fetchOwnRequisites = () => callApi<OwnRequisitesDto>("/api/requisites");

export const saveOwnRequisites = (value: Requisites) =>
  callApi<OwnRequisitesDto & { outcome: SaveOutcomeDto }>("/api/requisites", { method: "PUT", body: JSON.stringify(value) });

export const fetchDealRequisites = (dealId: string) => callApi<DealRequisitesDto>(`/api/deals/${encodeURIComponent(dealId)}/requisites`);
