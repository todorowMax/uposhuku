// lib/crypto/pay-flow.ts
//
// Транзакції оплати з гаманця: схвалення токена рівно на потрібну суму і сам платіж. Без React, лише wagmi/actions,
// тож цей код проганяється наскрізним сценарієм проти локальної мережі (scripts/e2e-wallet.ts). Підключати лише
// з динамічно завантажених панелей гаманця: wagmi у загальний пакет потрапляти не повинен.

import type { Address, Hex } from "viem";
import { writeContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { erc20Abi } from "./abi/erc20";
import { feeRouterAbi } from "./abi/fee-router";
import { approvalSteps } from "./approvals";
import type { PublicCryptoConfig } from "./config";
import { readViaWallet, waitReceiptViaWallet } from "./wallet-read";

/** Помилка, текст якої написано для людини й можна показувати як є. */
export class WalletFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletFlowError";
  }
}

export type PayPhase = "approving" | "paying";

export interface ApproveInput {
  config: Config;
  crypto: Pick<PublicCryptoConfig, "chainId" | "token">;
  owner: Address;
  spender: Address;
  needed: bigint;
  onPhase?: (phase: PayPhase) => void;
}

/**
 * Схвалення spender рівно на `needed`, ніколи не безмежне. Поточне читаємо: якщо вистачає, не просимо нічого;
 * якщо воно ненульове й менше потрібного, спершу скидаємо до нуля (вимога USDT в Ethereum). Повертає хеші схвалень.
 */
export const approveExact = async (input: ApproveInput): Promise<Hex[]> => {
  const { config, crypto, owner, spender, needed, onPhase } = input;
  const base = { chainId: crypto.chainId, abi: erc20Abi, address: crypto.token } as const;
  const current = (await readViaWallet(config, { ...base, functionName: "allowance", args: [owner, spender] })) as bigint;
  const hashes: Hex[] = [];
  for (const step of approvalSteps(current, needed)) {
    onPhase?.("approving");
    const hash = await writeContract(config, { ...base, functionName: "approve", args: [spender, step] });
    await waitReceiptViaWallet(config, { hash, chainId: crypto.chainId });
    hashes.push(hash);
  }
  return hashes;
};

export interface DirectPaymentInput {
  config: Config;
  crypto: PublicCryptoConfig;
  owner: Address;
  recipient: Address;
  units: bigint;
  dealRef: Hex;
  onPhase?: (phase: PayPhase) => void;
}

/** Прямий платіж. Без FeeRouter це transfer токена; із ним схвалення на суму з комісією й один виклик pay. Повертає хеш платежу. */
export const sendDirectPayment = async (input: DirectPaymentInput): Promise<Hex> => {
  const { config, crypto, owner, recipient, units, dealRef, onPhase } = input;
  const token = { chainId: crypto.chainId, abi: erc20Abi, address: crypto.token } as const;
  const balance = (await readViaWallet(config, { ...token, functionName: "balanceOf", args: [owner] })) as bigint;
  if (!crypto.router) {
    if (balance < units) throw new WalletFlowError("На гаманці не вистачає USDT для цього платежу.");
    onPhase?.("paying");
    return writeContract(config, { ...token, functionName: "transfer", args: [recipient, units] });
  }
  const fee = (await readViaWallet(config, { chainId: crypto.chainId, abi: feeRouterAbi, address: crypto.router, functionName: "quoteFee", args: [units] })) as bigint;
  if (balance < units + fee) throw new WalletFlowError("На гаманці не вистачає USDT для платежу з комісією.");
  await approveExact({ config, crypto, owner, spender: crypto.router, needed: units + fee, onPhase });
  onPhase?.("paying");
  return writeContract(config, { chainId: crypto.chainId, abi: feeRouterAbi, address: crypto.router, functionName: "pay", args: [crypto.token, recipient, units, dealRef] });
};
