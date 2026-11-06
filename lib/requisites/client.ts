"use client";

// lib/requisites/client.ts
//
// Реквізити для прямого переказу в браузері: свої (кабінет виконавця) і знімок за угодою.
// Значення не кладемо в спільні сховища й не пишемо в журнал.

import { callApi } from "@/lib/deals/client";
import type { PaymentMethod, Requisites } from "@/lib/deals/requisites";

export interface OwnRequisitesDto {
  requisites: Requisites | null;
  mask: string | null;
  pending: { requisites: Requisites; mask: string; effectiveAt: number } | null;
  /** Чи доступна цій людині оплата USDT: тоді в формі є адреса TRC-20 і Binance ID. */
  crypto: boolean;
  /** Чи доступне підтвердження адреси гаманця (прапорець `crypto_wallet` і налаштована мережа). */
  wallet: boolean;
  /** Чи доступні PayPal і Wise (прапорець `foreign_links`). */
  foreign: boolean;
}

export type SaveOutcomeDto = { kind: "saved" } | { kind: "pending"; effectiveAt: number };

export interface DealRequisitesDto {
  requisites: Requisites | null;
  mask: string | null;
  /** Способи оплати, які доступні цій людині в цій угоді (лише назви). */
  methods: PaymentMethod[];
  /** Чи доступна цій людині оплата USDT за хешем (прапорець `crypto_proof`). */
  crypto: boolean;
  /** Показувати QR: false на проді, поки формат НБУ не перевірено в банках. */
  qr: boolean;
  /** Чи доступна оплата з гаманця цій людині. */
  wallet: boolean;
}

export const fetchOwnRequisites = () => callApi<OwnRequisitesDto>("/api/requisites");

export const saveOwnRequisites = (value: Requisites) =>
  callApi<OwnRequisitesDto & { outcome: SaveOutcomeDto }>("/api/requisites", { method: "PUT", body: JSON.stringify(value) });

export const fetchDealRequisites = (dealId: string) => callApi<DealRequisitesDto>(`/api/deals/${encodeURIComponent(dealId)}/requisites`);
