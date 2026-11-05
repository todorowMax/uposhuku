// lib/server/crypto-proof-repo.ts
//
// Підтверджені оплати USDT TRC-20 за хешем (таблиця crypto_proofs). Один хеш рахується лише раз: унікальний індекс
// ловить і гонку двох запитів, і спробу використати чужу оплату в іншій угоді.

import { eq } from "drizzle-orm";
import { cryptoProofs } from "@/db/schema";
import { getDb } from "./db";

/** Спільна форма підтвердженої оплати для TRON і EVM. */
export interface ProofData {
  from: string;
  to: string;
  amountUnits: string;
  confirmations: number;
  blockTime: number;
}

export type ProofChain = "tron" | "evm";

export interface StoredProof {
  id: string;
  dealId: string;
  stageId: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amountUnits: string;
  confirmations: number;
  blockTime: number;
  chain: ProofChain;
}

export const proofByHash = async (txHash: string): Promise<StoredProof | null> => ((await getDb().select().from(cryptoProofs).where(eq(cryptoProofs.txHash, txHash)).limit(1))[0] as StoredProof | undefined) ?? null;

/** Записує оплату. false, якщо цей хеш уже використано (у цій чи іншій угоді). */
export const saveProof = async (input: { dealId: string; stageId: string; txHash: string; proof: ProofData; chain?: ProofChain }, now = Date.now()): Promise<StoredProof | null> => {
  const { dealId, stageId, txHash, proof, chain = "tron" } = input;
  const row = { id: `cp_${crypto.randomUUID().slice(0, 10)}`, dealId, stageId, txHash, fromAddress: proof.from, toAddress: proof.to, amountUnits: proof.amountUnits, confirmations: proof.confirmations, blockTime: proof.blockTime, chain };
  const inserted = await getDb().insert(cryptoProofs).values({ ...row, createdAt: now }).onConflictDoNothing().returning({ id: cryptoProofs.id });
  return inserted.length > 0 ? row : null;
};

export const deleteProof = async (id: string): Promise<void> => {
  await getDb().delete(cryptoProofs).where(eq(cryptoProofs.id, id));
};

export const listDealProofs = async (dealId: string): Promise<StoredProof[]> => (await getDb().select().from(cryptoProofs).where(eq(cryptoProofs.dealId, dealId))) as StoredProof[];
