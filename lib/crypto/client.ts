"use client";

// lib/crypto/client.ts
//
// Оплата USDT TRC-20 за хешем в браузері: надіслати хеш на перевірку й прочитати підтверджені оплати угоди.

import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { callApi } from "@/lib/deals/client";

export interface CryptoProofDto {
  stageId: string;
  amount: string;
  /** Посилання в оглядачі мережі; null, якщо для мережі оглядача немає. */
  explorerUrl: string | null;
}

export interface DealProofDto extends CryptoProofDto {
  from: string;
  confirmations: number;
  chain: "tron" | "evm";
}

export const submitCryptoProof = (dealId: string, hash: string) =>
  callApi<{ proof: CryptoProofDto }>(`/api/deals/${encodeURIComponent(dealId)}/crypto-proof`, { method: "POST", body: JSON.stringify({ hash }) });

export const fetchDealProofs = (dealId: string) => callApi<{ proofs: DealProofDto[] }>(`/api/deals/${encodeURIComponent(dealId)}/crypto-proof`);

export interface CryptoConfigDto {
  wallet: boolean;
  escrow: boolean;
  config: PublicCryptoConfig | null;
}

export const fetchCryptoConfig = () => callApi<CryptoConfigDto>("/api/crypto/config");

export const requestWalletChallenge = (address: string) => callApi<{ nonce: string; message: string }>("/api/requisites/wallet/challenge", { method: "POST", body: JSON.stringify({ address }) });

export const sendWalletSignature = (nonce: string, signature: string) =>
  callApi<{ outcome: { kind: "saved" } | { kind: "pending"; effectiveAt: number } | { kind: "unchanged" }; address: string }>("/api/requisites/wallet", { method: "POST", body: JSON.stringify({ nonce, signature }) });

export const submitWalletPayment = (dealId: string, hash: string) =>
  callApi<{ proof: CryptoProofDto }>(`/api/deals/${encodeURIComponent(dealId)}/wallet-pay`, { method: "POST", body: JSON.stringify({ hash }) });
