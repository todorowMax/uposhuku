"use client";

// lib/crypto/client.ts
//
// Оплата USDT TRC-20 за хешем в браузері: надіслати хеш на перевірку й прочитати підтверджені оплати угоди.

import { callApi } from "@/lib/deals/client";

export interface CryptoProofDto {
  stageId: string;
  amount: string;
  explorerUrl: string;
}

export interface DealProofDto extends CryptoProofDto {
  from: string;
  confirmations: number;
}

export const submitCryptoProof = (dealId: string, hash: string) =>
  callApi<{ proof: CryptoProofDto }>(`/api/deals/${encodeURIComponent(dealId)}/crypto-proof`, { method: "POST", body: JSON.stringify({ hash }) });

export const fetchDealProofs = (dealId: string) => callApi<{ proofs: DealProofDto[] }>(`/api/deals/${encodeURIComponent(dealId)}/crypto-proof`);
