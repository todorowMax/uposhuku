// lib/server/rate-limit.ts
//
// Обмеження частоти запитів на маршрутах з грошима й особистими даними. Лічильник у D1 (таблиця auth_attempts,
// kind = "rate"), а не в пам'яті воркера: ізоляти не діляться станом. Ключ: назва правила + користувач чи IP.
// Значення правил живуть тут константами; порушення дає 429 у тому ж вигляді, що й вхід.

import { and, eq, gt } from "drizzle-orm";
import { problem } from "@/lib/api/problem";
import { authAttempts } from "@/db/schema";
import { getDb } from "./db";

const MINUTE = 60_000;

export interface RateRule {
  max: number;
  windowMs: number;
}

/** Правила за маршрутами: скільки звернень користувача за вікно. */
export const RATE_RULES = {
  dealCreate: { max: 20, windowMs: 60 * MINUTE },
  dealAction: { max: 60, windowMs: 10 * MINUTE },
  dealPay: { max: 10, windowMs: 10 * MINUTE },
  dealRequisitesRead: { max: 30, windowMs: 10 * MINUTE },
  requisitesWrite: { max: 10, windowMs: 60 * MINUTE },
  requisitesRead: { max: 60, windowMs: 10 * MINUTE },
  cryptoProof: { max: 10, windowMs: 10 * MINUTE },
  walletChallenge: { max: 10, windowMs: 10 * MINUTE },
  walletVerify: { max: 10, windowMs: 10 * MINUTE },
  walletPay: { max: 10, windowMs: 10 * MINUTE },
  payoutApply: { max: 5, windowMs: 60 * MINUTE },
  releaseCode: { max: 5, windowMs: 60 * MINUTE },
  adminDecision: { max: 30, windowMs: 10 * MINUTE },
  adminTotp: { max: 10, windowMs: 10 * MINUTE },
  cspReport: { max: 60, windowMs: 10 * MINUTE },
} as const satisfies Record<string, RateRule>;

export type RateName = keyof typeof RATE_RULES;

/**
 * Рахує звернення й каже, чи перевищено правило. Запис додається лише тоді, коли звернення
 * пропущено. Відмови не пишемо: настирливий клієнт не роздуває таблицю, а вікно ковзає за пропущеними
 * зверненнями, тож після вичікування ліміт знову відкривається. `at` лише для тестів.
 */
export const overLimit = async (name: RateName, subject: string, at = Date.now()): Promise<boolean> => {
  const rule = RATE_RULES[name];
  const key = `${name}:${subject}`;
  const db = getDb();
  const recent = await db
    .select({ id: authAttempts.id })
    .from(authAttempts)
    .where(and(eq(authAttempts.key, key), eq(authAttempts.kind, "rate"), gt(authAttempts.createdAt, at - rule.windowMs)));
  if (recent.length >= rule.max) return true;
  await db.insert(authAttempts).values({ key, kind: "rate", createdAt: at });
  return false;
};

/** 429, якщо правило перевищено; null, якщо можна продовжувати. */
export const rateLimited = async (name: RateName, subject: string): Promise<Response | null> =>
  (await overLimit(name, subject)) ? problem(429, "Забагато спроб", "Забагато запитів поспіль. Спробуйте ще раз трохи згодом.", "/problems/rate-limited") : null;
