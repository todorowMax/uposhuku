// lib/server/release-code.ts
//
// Код з пошти замовника для приймання етапу від RELEASE_CODE_FROM. Схема та сама, що в кодах входу
// (lib/server/auth.ts): у базі лише SHA-256, код живе 10 хвилин, 5 спроб на код, новий лист не частіше разу на хвилину.
// Автоприймання (deal-sweep) коду не потребує: там рішення за мовчанням, а не за кліком.

import { and, eq } from "drizzle-orm";
import { dealReleaseCodes } from "@/db/schema";
import { getDb } from "./db";
import { devCode } from "./auth";
import { mailMode, sendReleaseCodeMail } from "./mail";

const CODE_TTL = 10 * 60_000;
const RESEND_GAP = 60_000;
const MAX_TRIES = 5;

export interface CodeTarget {
  userId: string;
  dealId: string;
  stageId: string;
}

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hashOf = (target: CodeTarget, code: string) => sha256(`${target.userId}:${target.dealId}:${target.stageId}:${code}`);

const sameText = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return diff === 0;
};

const whereTarget = (target: CodeTarget) => and(eq(dealReleaseCodes.userId, target.userId), eq(dealReleaseCodes.dealId, target.dealId), eq(dealReleaseCodes.stageId, target.stageId));

export type SendOutcome = "sent" | "too_soon";

/** Шле код на пошту замовника. Повторний запит раніше ніж за хвилину нового листа не створює. */
export const sendReleaseCode = async (input: { target: CodeTarget; email: string; dealNumber: string; now?: number }): Promise<SendOutcome> => {
  const { target, email, dealNumber, now = Date.now() } = input;
  const db = getDb();
  const [last] = await db.select().from(dealReleaseCodes).where(whereTarget(target)).limit(1);
  if (last && now - last.createdAt < RESEND_GAP) return "too_soon";
  const code = mailMode() === "dev" ? devCode().code : String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await db.delete(dealReleaseCodes).where(whereTarget(target));
  await db.insert(dealReleaseCodes).values({ id: crypto.randomUUID(), ...target, codeHash: await hashOf(target, code), createdAt: now, expiresAt: now + CODE_TTL });
  await sendReleaseCodeMail(email, code, dealNumber);
  return "sent";
};

export type VerifyOutcome = "ok" | "wrong" | "expired";

/** Перевіряє код і знищує його при збігу: один код — одне приймання. Після MAX_TRIES помилок код мертвий. */
export const verifyReleaseCode = async (target: CodeTarget, code: unknown, now = Date.now()): Promise<VerifyOutcome> => {
  const db = getDb();
  const [stored] = await db.select().from(dealReleaseCodes).where(whereTarget(target)).limit(1);
  if (!stored || stored.expiresAt < now || stored.attempts >= MAX_TRIES) return "expired";
  if (typeof code !== "string" || !/^\d{4,8}$/.test(code.trim()) || !sameText(stored.codeHash, await hashOf(target, code.trim()))) {
    await db.update(dealReleaseCodes).set({ attempts: stored.attempts + 1 }).where(eq(dealReleaseCodes.id, stored.id));
    return "wrong";
  }
  await db.delete(dealReleaseCodes).where(eq(dealReleaseCodes.id, stored.id));
  return "ok";
};
