"use client";

// components/wallet/use-direct-wallet-pay.ts
//
// Прямий платіж USDT з гаманця замовника. Без комісії це transfer токена; із комісією (задано FeeRouter) спершу
// схвалення рівно на суму з комісією (за потреби після скидання до нуля) і один виклик pay. Хеш іде на сервер, який
// сам читає квитанцію: клієнт лише вказує, де дивитися. Етап стає «claimed» після перевірки сервера.

import { useState } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useConfig, useConnection } from "wagmi";
import { ApiError } from "@/lib/auth/client";
import { submitWalletPayment } from "@/lib/crypto/client";
import type { PublicCryptoConfig } from "@/lib/crypto/config";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { sendDirectPayment, WalletFlowError } from "@/lib/crypto/pay-flow";
import { walletErrorText } from "@/lib/crypto/wallet-errors";
import { USDT_DECIMALS } from "@/lib/crypto/units";

export namespace DirectWalletPayTypes {
  export type Phase = "idle" | "approving" | "paying" | "mining" | "checking" | "paid";
  export interface Options {
    dealId: string;
    stageId: string;
    recipient: string;
    crypto: PublicCryptoConfig;
    onPaid: () => void;
  }
}

const PHASE_TEXT: Record<DirectWalletPayTypes.Phase, string> = {
  idle: "",
  approving: "Підтвердьте схвалення в гаманці: лише на суму цього платежу.",
  paying: "Підтвердьте платіж у гаманці та звірте адресу на екрані пристрою.",
  mining: "Чекаємо, поки мережа прийме транзакцію…",
  checking: "Сайт перевіряє транзакцію в мережі…",
  paid: "Оплату підтверджено мережею. Виконавець підтвердить отримання.",
};

/** Сума в мінімальних одиницях або null, якщо введення не число більше нуля з не більш як 6 знаками. */
export const parseUsdtInput = (value: string): bigint | null => {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const units = parseUnits(text, USDT_DECIMALS);
  return units > 0n ? units : null;
};

export const useDirectWalletPay = (options: DirectWalletPayTypes.Options) => {
  const { dealId, stageId, recipient, crypto, onPaid } = options;
  const config = useConfig();
  const connection = useConnection();
  const [amount, setAmount] = useState("");
  const [verified, setVerified] = useState(false);
  const [phase, setPhase] = useState<DirectWalletPayTypes.Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  const units = parseUsdtInput(amount);
  const owner = connection.address as Address | undefined;
  const ready = connection.status === "connected" && connection.chainId === crypto.chainId;
  const working = phase !== "idle" && phase !== "paid" && !(phase === "checking" && error);
  const canPay = ready && units !== null && verified && phase === "idle";

  const wait = (tx: Hex) => waitForTransactionReceipt(config, { hash: tx, chainId: crypto.chainId });

  const check = async (tx: Hex) => {
    setPhase("checking");
    setError(null);
    try {
      await submitWalletPayment(dealId, tx);
      setPhase("paid");
      onPaid();
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof WalletFlowError ? reason.message : walletErrorText(reason));
    }
  };

  const pay = async () => {
    if (!canPay || !owner || units === null) return;
    setError(null);
    try {
      const tx = await sendDirectPayment({ config, crypto, owner, recipient: recipient as Address, units, dealRef: dealRefOf(dealId, stageId), onPhase: setPhase });
      setHash(tx);
      setPhase("mining");
      const receipt = await wait(tx);
      if (receipt.status !== "success") throw new WalletFlowError("Транзакція не виконана в мережі. Гроші не списано.");
      await check(tx);
    } catch (reason) {
      setPhase("idle");
      setError(reason instanceof ApiError || reason instanceof WalletFlowError ? reason.message : walletErrorText(reason));
    }
  };

  return { amount, setAmount, verified, setVerified, units, ready, canPay, phase, working, status: PHASE_TEXT[phase], error, hash, pay, recheck: () => (hash ? check(hash) : Promise.resolve()) };
};
