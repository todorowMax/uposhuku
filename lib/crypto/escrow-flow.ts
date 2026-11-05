// lib/crypto/escrow-flow.ts
//
// Транзакції ескроу з гаманця. Замовник вносить гроші (схвалення рівно на суму з комісією) і приймає роботу;
// виконавець здає; завершити за таймером чи відкрити спір може кожна зі сторін. Підписує завжди власник гаманця,
// сервер ключів не тримає. Без React: код проганяється наскрізним сценарієм (scripts/e2e-wallet.ts).

import type { Address, Hex } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { dealEscrowAbi } from "./abi/deal-escrow";
import { escrowFactoryAbi } from "./abi/escrow-factory";
import type { PublicCryptoConfig } from "./config";
import { approveExact, WalletFlowError, type PayPhase } from "./pay-flow";

export interface CreateEscrowInput {
  config: Config;
  crypto: PublicCryptoConfig;
  owner: Address;
  deal: { performer: Address; amount: bigint; deliverBy: bigint; reviewPeriod: bigint; dealRef: Hex };
  onPhase?: (phase: PayPhase) => void;
}

/** Внесення: схвалення фабриці рівно на `quoteDeposit(amount)` і createDeal. Повертає хеш створення. */
export const createEscrowDeal = async (input: CreateEscrowInput): Promise<Hex> => {
  const { config, crypto, owner, deal, onPhase } = input;
  if (!crypto.factory) throw new WalletFlowError("Ескроу ще не налаштовано.");
  const factory = { chainId: crypto.chainId, abi: escrowFactoryAbi, address: crypto.factory } as const;
  const deposit = (await readContract(config, { ...factory, functionName: "quoteDeposit", args: [deal.amount] })) as bigint;
  await approveExact({ config, crypto, owner, spender: crypto.factory, needed: deposit, onPhase });
  onPhase?.("paying");
  return writeContract(config, { ...factory, functionName: "createDeal", args: [deal.performer, deal.amount, deal.deliverBy, deal.reviewPeriod, deal.dealRef] });
};

export type EscrowAction = "deliver" | "release" | "settle" | "dispute";

/** Дія над клоном: здати (виконавець), прийняти (замовник), завершити за таймером (будь-хто), відкрити спір (сторона). */
export const actOnEscrow = async (input: { config: Config; chainId: number; escrow: Address; action: EscrowAction }): Promise<Hex> => {
  const { config, chainId, escrow, action } = input;
  const hash = await writeContract(config, { chainId, abi: dealEscrowAbi, address: escrow, functionName: action });
  await waitForTransactionReceipt(config, { hash, chainId });
  return hash;
};
