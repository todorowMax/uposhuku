// lib/crypto/wallet-read.ts
//
// Читання мережі через провайдер підключеного гаманця, а не через публічний RPC за замовчуванням (http() у wagmi):
// баланс, схвалення, ставка комісії й очікування квитанції йдуть тим самим вузлом, що й підпис. Окремої змінної
// оточення не потрібно. Лише з динамічно завантажених панелей гаманця.

import type { Abi, Address, Hex, TransactionReceipt } from "viem";
import { readContract, waitForTransactionReceipt } from "viem/actions";
import { getConnectorClient } from "wagmi/actions";
import type { Config } from "wagmi";

export interface WalletCall {
  chainId: number;
  abi: Abi;
  address: Address;
  functionName: string;
  args?: readonly unknown[];
}

/** Виклик view-функції контракту через провайдер гаманця. */
export const readViaWallet = async (config: Config, call: WalletCall): Promise<unknown> => {
  const client = await getConnectorClient(config, { chainId: call.chainId });
  const { chainId: _chainId, ...rest } = call;
  return readContract(client, rest as never);
};

/** Чекає квитанцію через провайдер гаманця. */
export const waitReceiptViaWallet = async (config: Config, input: { hash: Hex; chainId: number }): Promise<TransactionReceipt> => {
  const client = await getConnectorClient(config, { chainId: input.chainId });
  return waitForTransactionReceipt(client, { hash: input.hash });
};
