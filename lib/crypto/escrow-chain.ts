// lib/crypto/escrow-chain.ts
//
// Ескроу-угода в блокчейні, читання на сервері. Істина тут: статус етапу сервер виводить лише зі стану контракту,
// а не зі слів клієнта. `verifyEscrowCreated` перевіряє подію DealCreated із квитанції створення (фабрика, сторони,
// сума, посилання на етап), `readEscrow` читає поточний стан клона через eth_call, `escrowStageOutcome` чиста
// відповідність «стан контракту → що стало з етапом».

import { decodeEventLog, decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";
import { dealEscrowAbi } from "./abi/deal-escrow";
import { escrowFactoryAbi } from "./abi/escrow-factory";
import type { EvmLog } from "./evm";
import { EvmUnavailableError } from "./evm";

/** State у DealEscrow: 0 не ініціалізовано, 1 внесено, 2 здано, 3 спір, 4 закрито. */
export type EscrowState = 0 | 1 | 2 | 3 | 4;

export interface EscrowSnapshot {
  state: EscrowState;
  client: string;
  performer: string;
  /** Ціна без комісії, мінімальні одиниці токена. */
  amount: bigint;
  /** Скільки отримав виконавець після закриття. */
  paidToPerformer: bigint;
  dealRef: string;
  deliverBy: number;
  reviewEnds: number;
}

export type EscrowOutcome =
  | { kind: "none" }
  | { kind: "funded" }
  | { kind: "delivered"; reviewEnds: number }
  | { kind: "disputed" }
  | { kind: "released"; paid: bigint }
  | { kind: "refunded" };

/** Що сталося з етапом за станом контракту. Закрито з виплатою виконавцю це released (повна чи часткова), без виплати refunded. */
export const escrowStageOutcome = (snapshot: EscrowSnapshot): EscrowOutcome => {
  switch (snapshot.state) {
    case 1:
      return { kind: "funded" };
    case 2:
      return { kind: "delivered", reviewEnds: snapshot.reviewEnds };
    case 3:
      return { kind: "disputed" };
    case 4:
      return snapshot.paidToPerformer > 0n ? { kind: "released", paid: snapshot.paidToPerformer } : { kind: "refunded" };
    default:
      return { kind: "none" };
  }
};

export interface EscrowExpectation {
  factory: Address;
  client: string;
  performer: string;
  amount: bigint;
  dealRef: Hex;
}

export type EscrowCreation = { ok: true; escrow: Address; fee: bigint } | { ok: false; reason: "no_event" | "wrong_party" | "wrong_amount" | "wrong_ref" };

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Подія DealCreated від нашої фабрики з очікуваними замовником, виконавцем, сумою і посиланням на етап. */
export const verifyEscrowCreated = (logs: EvmLog[], expected: EscrowExpectation): EscrowCreation => {
  for (const log of logs) {
    if (!same(log.address, expected.factory)) continue;
    try {
      const decoded = decodeEventLog({ abi: escrowFactoryAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.eventName !== "DealCreated") continue;
      const args = decoded.args as { dealRef: Hex; escrow: Address; client: Address; performer: Address; amount: bigint; fee: bigint };
      if (args.dealRef.toLowerCase() !== expected.dealRef.toLowerCase()) return { ok: false, reason: "wrong_ref" };
      if (!same(args.client, expected.client) || !same(args.performer, expected.performer)) return { ok: false, reason: "wrong_party" };
      if (args.amount !== expected.amount) return { ok: false, reason: "wrong_amount" };
      return { ok: true, escrow: args.escrow, fee: args.fee };
    } catch {
      continue;
    }
  }
  return { ok: false, reason: "no_event" };
};

type Fetcher = typeof fetch;

const call = async (input: { rpcUrl: string; to: Address; data: Hex; fetcher: Fetcher }): Promise<Hex> => {
  const { rpcUrl, to, data, fetcher } = input;
  let body: { result?: unknown; error?: unknown };
  try {
    const response = await fetcher(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new EvmUnavailableError();
    body = (await response.json()) as typeof body;
  } catch {
    throw new EvmUnavailableError();
  }
  if (body.error !== undefined || typeof body.result !== "string" || body.result === "0x") throw new EvmUnavailableError();
  return body.result as Hex;
};

/** Поточний стан клона. Помилка вузла піднімається EvmUnavailableError: статус етапу тоді не міняємо. */
export const readEscrow = async (rpcUrl: string, escrow: Address, fetcher: Fetcher = fetch): Promise<EscrowSnapshot> => {
  const read = async (functionName: "state" | "client" | "performer" | "amount" | "paidToPerformer" | "dealRef" | "deliverBy" | "reviewEnds") => {
    const data = encodeFunctionData({ abi: dealEscrowAbi, functionName });
    return decodeFunctionResult({ abi: dealEscrowAbi, functionName, data: await call({ rpcUrl, to: escrow, data, fetcher }) });
  };
  const [state, client, performer, amount, paid, dealRef, deliverBy, reviewEnds] = await Promise.all([
    read("state"),
    read("client"),
    read("performer"),
    read("amount"),
    read("paidToPerformer"),
    read("dealRef"),
    read("deliverBy"),
    read("reviewEnds"),
  ]);
  return { state: Number(state) as EscrowState, client: client as string, performer: performer as string, amount: amount as bigint, paidToPerformer: paid as bigint, dealRef: dealRef as string, deliverBy: Number(deliverBy), reviewEnds: Number(reviewEnds) };
};
