"use client";

// kit/telemetry/client/ids.ts
//
// Ідентифікатори браузера: пристрій (`anonId`) і сесія. Усе залежить від
// згоди (див. consent.ts): без неї пристрій не позначаємо взагалі, а сесія
// живе лише в пам'яті вкладки.

import { safeStorage } from "./config";
import { getConsent } from "./consent";

const SESSION_IDLE_MS = 30 * 60 * 1000;

export const randomId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

let memorySession: { id: string; at: number } | null = null;

/** Постійний ідентифікатор пристрою. `null`, поки немає згоди. */
export const getAnonId = (): string | null => {
  if (getConsent() !== "granted") return null;
  const local = safeStorage("local");
  let id = local.read("aid");
  if (!id) {
    id = randomId();
    local.write("aid", id);
  }
  return id;
};

/**
 * Сесія: нова після 30 хвилин без дій. Зі згодою переживає перезавантаження
 * вкладки (sessionStorage), без згоди живе лише в пам'яті.
 */
export const getSessionId = (now = Date.now()): string => {
  const persistent = getConsent() === "granted";
  const store = safeStorage("session");
  let current = memorySession;
  if (persistent) {
    const id = store.read("sid");
    const at = Number(store.read("sat"));
    if (id && Number.isFinite(at)) current = { id, at };
  }
  if (!current || now - current.at > SESSION_IDLE_MS) current = { id: randomId(), at: now };
  current = { ...current, at: now };
  memorySession = current;
  if (persistent) {
    store.write("sid", current.id);
    store.write("sat", String(now));
  }
  return current.id;
};

/** Для звітів про помилки: ідентифікатори лише зі згодою. */
export const getReportIds = (): { anonId?: string; sessionId?: string } => {
  if (getConsent() !== "granted") return {};
  const anonId = getAnonId();
  return { ...(anonId ? { anonId } : {}), sessionId: getSessionId() };
};

/** Лише для тестів. */
export const resetIdsForTests = (): void => {
  memorySession = null;
};
