// lib/server/wallet-repo.ts
//
// Запити на підпис адреси гаманця (таблиця wallet_challenges). Код одноразовий: його «спалюємо» одним
// атомарним оновленням до перевірки підпису, тож два паралельні запити не пройдуть обидва.

import { and, eq, gt, isNull } from "drizzle-orm";
import { walletChallenges } from "@/db/schema";
import { WALLET_CHALLENGE_TTL_MS } from "@/lib/crypto/wallet-sign";
import { getDb } from "./db";

export interface Challenge {
  nonce: string;
  userId: string;
  address: string;
  domain: string;
  createdAt: number;
  expiresAt: number;
}

export const createChallenge = async (input: { userId: string; address: string; domain: string }, now = Date.now()): Promise<Challenge> => {
  const challenge: Challenge = { ...input, nonce: crypto.randomUUID().replace(/-/g, ""), createdAt: now, expiresAt: now + WALLET_CHALLENGE_TTL_MS };
  await getDb().insert(walletChallenges).values(challenge);
  return challenge;
};

/** Забирає запит свого користувача: чинний і ще не використаний. null, якщо такого немає. */
export const consumeChallenge = async (input: { userId: string; nonce: string }, now = Date.now()): Promise<Challenge | null> => {
  const { userId, nonce } = input;
  const [row] = await getDb()
    .update(walletChallenges)
    .set({ usedAt: now })
    .where(and(eq(walletChallenges.nonce, nonce), eq(walletChallenges.userId, userId), isNull(walletChallenges.usedAt), gt(walletChallenges.expiresAt, now)))
    .returning();
  return row ? { nonce: row.nonce, userId: row.userId, address: row.address, domain: row.domain, createdAt: row.createdAt, expiresAt: row.expiresAt } : null;
};
