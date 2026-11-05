// lib/crypto/chains.ts
//
// Опис мережі за id: назва, оглядач і об'єкт мережі для wagmi. Відомі мережі беруться з viem; решта отримує
// загальний опис без оглядача. Мережа вибирається змінною CRYPTO_CHAIN_ID, у збірці не зашита.

import { defineChain, type Chain } from "viem";
import { arbitrum, hardhat, mainnet, polygon } from "viem/chains";

const KNOWN: readonly Chain[] = [mainnet, polygon, arbitrum, hardhat];

export const chainById = (chainId: number): Chain =>
  KNOWN.find((chain) => chain.id === chainId) ??
  defineChain({ id: chainId, name: `Мережа ${chainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } });

/** Посилання на транзакцію в оглядачі або null, якщо оглядача для мережі немає. */
export const evmExplorerLink = (chainId: number, hash: string): string | null => {
  const base = chainById(chainId).blockExplorers?.default.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null;
};
