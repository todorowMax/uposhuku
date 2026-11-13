"use client";

// components/wallet/use-address-proof.ts
//
// Підтвердження адреси виконавця підписом: запит на підпис у сервера, підпис у гаманці, відправка підпису.
// Адресу в реквізити ставить сервер після перевірки; вона діє через 24 години, як будь-яка зміна реквізитів.

import { useState } from "react";
import { signMessage } from "wagmi/actions";
import { useConfig } from "wagmi";
import { ApiError } from "@/lib/auth/client";
import { requestWalletChallenge, sendWalletSignature } from "@/lib/crypto/client";
import { walletErrorText } from "@/lib/crypto/wallet-errors";
import { withRiskAck } from "@/lib/legal/client";

export namespace AddressProofTypes {
  export type Result = { kind: "saved" } | { kind: "pending"; effectiveAt: number } | { kind: "unchanged" };
}

export const useAddressProof = (address: string | null, onDone: () => void) => {
  const config = useConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AddressProofTypes.Result | null>(null);

  const confirm = async () => {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce, message } = await withRiskAck(() => requestWalletChallenge(address));
      const signature = await signMessage(config, { message });
      const done = await withRiskAck(() => sendWalletSignature(nonce, signature));
      setResult(done.outcome);
      onDone();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : walletErrorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, result, confirm };
};
