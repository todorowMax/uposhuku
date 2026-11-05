// tests/helpers/evm-logs.ts
//
// Журнали транзакцій EVM для тестів сервера: Transfer токена і Paid із FeeRouter.

import { encodeAbiParameters, pad, toEventSelector, toHex, type Hex } from "viem";
import type { EvmChain, EvmLog } from "@/lib/crypto/evm";

export const TOKEN = "0x00000000000000000000000000000000000a1111";
export const ROUTER = "0x00000000000000000000000000000000000b2222";
export const PAYER = "0x00000000000000000000000000000000000c3333";
export const RECIPIENT = "0x00000000000000000000000000000000000d4444";
export const STRANGER = "0x00000000000000000000000000000000000e5555";
export const CHAIN_ID = 31337;

const TRANSFER = toEventSelector("Transfer(address,address,uint256)");
const PAID = toEventSelector("Paid(bytes32,address,address,address,uint256,uint256)");

export const transferLog = (input: { token?: string; from: string; to: string; amount: bigint }): EvmLog => ({
  address: input.token ?? TOKEN,
  topics: [TRANSFER, pad(input.from as Hex), pad(input.to as Hex)],
  data: toHex(input.amount, { size: 32 }),
});

export const paidLog = (input: { router?: string; ref: Hex; payer: string; recipient: string; token?: string; amount: bigint; fee: bigint }): EvmLog => ({
  address: input.router ?? ROUTER,
  topics: [PAID, input.ref, pad(input.payer as Hex), pad(input.recipient as Hex)],
  data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], [(input.token ?? TOKEN) as Hex, input.amount, input.fee]),
});

/** Мережа з однією успішною транзакцією, якій вистачає підтверджень і яка після прийняття угоди. */
export const chainWith = (logs: EvmLog[], over: Partial<EvmChain> = {}): EvmChain => ({
  chainId: CHAIN_ID,
  receipt: { status: "0x1", blockNumber: 100, logs },
  latestBlock: 120,
  blockTime: Date.now() + 60_000,
  ...over,
});
