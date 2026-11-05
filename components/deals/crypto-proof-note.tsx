"use client";

// components/deals/crypto-proof-note.tsx
//
// Підтверджена мережею оплата USDT за етапом: сума й посилання на обозреватель. Виконавець бачить її перед тим, як
// підтвердити отримання. Курс сторін сайт не знає, тож виконавець підтверджує сам. Нічого не показує без оплати.

import { useCryptoProofs } from "./use-crypto-proofs";

export const CryptoProofNote = ({ dealId, stageId }: { dealId: string; stageId: string }) => {
  const proof = useCryptoProofs(dealId, stageId);
  if (!proof) return null;
  return (
    <p className="deal-note" role="status">
      Замовник надіслав {proof.amount} USDT (TRC-20), мережа підтвердила переказ.{" "}
      <a href={proof.explorerUrl} target="_blank" rel="noopener noreferrer" className="auth-link">
        Переглянути в Tronscan
      </a>
      . Перевірте надходження й підтвердьте.
    </p>
  );
};
