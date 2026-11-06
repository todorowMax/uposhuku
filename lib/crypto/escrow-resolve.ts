// lib/crypto/escrow-resolve.ts
//
// Рішення спору ескроу: арбітр викликає resolve(performerPct) у клона. Сервер ключів не тримає й нічого не підписує:
// він лише готує адресу, мережу й calldata для мультипідпису (Safe). Чисті функції.

import { encodeFunctionData, type Address, type Hex } from "viem";
import { dealEscrowAbi } from "./abi/deal-escrow";

/** Крок відсотка в контракті. */
export const RESOLVE_STEP = 5;

/** Відсоток виконавцю: ціле від 0 до 100, кратне 5 (як у контракті), або текст помилки. */
export const checkResolvePercent = (value: unknown): number | string => {
  if (typeof value !== "number" || !Number.isInteger(value)) return "Вкажіть відсоток цілим числом.";
  if (value < 0 || value > 100 || value % RESOLVE_STEP !== 0) return `Відсоток від 0 до 100, кратний ${RESOLVE_STEP}.`;
  return value;
};

export interface ResolveTransaction {
  /** Контракт-клон етапу. */
  to: Address;
  chainId: number;
  /** Ether не передається. */
  value: "0";
  data: Hex;
}

export const resolveTransaction = (input: { escrow: Address; chainId: number; percent: number }): ResolveTransaction => ({
  to: input.escrow,
  chainId: input.chainId,
  value: "0",
  data: encodeFunctionData({ abi: dealEscrowAbi, functionName: "resolve", args: [input.percent] }),
});

/** Дія журналу для відсотка: усе виконавцю це виплата, нічого повернення, решта часткова виплата. */
export const journalAction = (percent: number): "release" | "refund" | "partial" => (percent === 100 ? "release" : percent === 0 ? "refund" : "partial");
