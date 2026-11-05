"use client";

// components/deals/use-crypto-proofs.ts
//
// Підтверджена оплата USDT цього етапу (одне читання). null, поки нема або запит не вдався.

import { useEffect, useState } from "react";
import { fetchDealProofs, type DealProofDto } from "@/lib/crypto/client";

export const useCryptoProofs = (dealId: string, stageId: string): DealProofDto | null => {
  const [proof, setProof] = useState<DealProofDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDealProofs(dealId)
      .then(({ proofs }) => !cancelled && setProof(proofs.find((item) => item.stageId === stageId) ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dealId, stageId]);
  return proof;
};
