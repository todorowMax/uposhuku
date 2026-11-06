// tests/helpers/auth-flow.ts
//
// Спільне для тестів входу: лист із кодом підміняється шпигуном, код читаємо з його викликів.

import { eq } from "drizzle-orm";
import type { Mock } from "vitest";
import { emailCodes, users } from "@/db/schema";
import { getDb } from "@/lib/server/db";

/** Останній код, який «надіслали» на цю пошту. */
export const codeSentTo = (sent: Mock, email: string): string => {
  const call = [...sent.mock.calls].reverse().find((args) => args[0] === email);
  if (!call) throw new Error(`Лист на ${email} не надсилали`);
  return String(call[1]);
};

/** Код, який точно не збігається з відправленим. */
export const wrongCodeFor = (code: string) => (code === "123456" ? "654321" : "123456");

export const userIdOf = async (email: string): Promise<string> => {
  const [row] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`Немає користувача ${email}`);
  return row.id;
};

/** Робить так, ніби код надіслали давно: повторний лист знову дозволений (пауза 60 с). */
export const ageCode = async (email: string, ms = 61_000) => {
  const userId = await userIdOf(email);
  await getDb().update(emailCodes).set({ createdAt: Date.now() - ms }).where(eq(emailCodes.userId, userId));
};
