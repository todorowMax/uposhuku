"use client";

// lib/legal/client.ts
//
// Згоди в браузері: статус «що прийняти», запис згоди, вікно ризиків крипти (одне на всі входи) і обгортка,
// що повторює дію після прийняття. Сервер сам перевіряє згоди на кожній дії (lib/server/legal-gate.ts);
// клієнт лише вчасно показує вікно ризиків: до транзакції в гаманці, яку сервер зупинити не може, і після 409.

import { ApiError, LEGAL_RECHECK_EVENT } from "@/lib/auth/client";
import { callApi } from "@/lib/deals/client";
import type { PendingDoc } from "@/lib/legal/acceptance";
import { RISK_ACK_CODE } from "@/lib/legal/codes";
import { createStore } from "@/lib/store";

export interface LegalStatus {
  pending: PendingDoc[];
  riskAccepted: boolean;
}

/** Останній відомий статус; null, поки не завантажено (або гість). */
export const legalStatusStore = createStore<LegalStatus | null>(null);

export const loadLegalStatus = async (): Promise<LegalStatus | null> => {
  try {
    const { pending, riskAccepted } = await callApi<LegalStatus>("/api/legal/status");
    const status = { pending, riskAccepted };
    legalStatusStore.set(status);
    return status;
  } catch {
    return null;
  }
};

/** Записує згоду з документами в їхній чинній версії; повертає свіжий статус. */
export const acceptDocs = async (docs: PendingDoc[]): Promise<LegalStatus> => {
  const { pending, riskAccepted } = await callApi<LegalStatus>("/api/legal/accept", { method: "POST", body: JSON.stringify({ docs }) });
  const status = { pending, riskAccepted };
  legalStatusStore.set(status);
  return status;
};

/** Запит на показ вікна ризиків: результат вирішує, чи йти далі. */
export interface RiskRequest {
  settle: (accepted: boolean) => void;
}

export const riskSheetStore = createStore<RiskRequest | null>(null);
let waiting: Promise<boolean> | null = null;

/** Відкриває вікно ризиків; кілька викликів поспіль чекають одну й ту саму відповідь. */
export const askRiskAck = (): Promise<boolean> => {
  waiting ??= new Promise<boolean>((resolve) => {
    riskSheetStore.set({
      settle: (accepted) => {
        riskSheetStore.set(null);
        waiting = null;
        resolve(accepted);
      },
    });
  });
  return waiting;
};

/** Перед дією, яку сервер зупинити не може (транзакція в гаманці): ризик уже прийнято або людина приймає його зараз. */
export const ensureRiskAck = async (): Promise<boolean> => {
  if (legalStatusStore.get()?.riskAccepted) return true;
  const status = await loadLegalStatus();
  // Спершу оновлені умови (дві правові шторки разом не показуємо), ризик після них.
  if (status && status.pending.length > 0) {
    window.dispatchEvent(new Event(LEGAL_RECHECK_EVENT));
    return false;
  }
  return status?.riskAccepted ? true : askRiskAck();
};

/** Виконує дію; відмова `risk_ack_required` відкриває вікно ризиків і після прийняття повторює дію один раз. */
export const withRiskAck = async <T,>(action: () => Promise<T>): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError && error.code === RISK_ACK_CODE && (await askRiskAck())) return action();
    throw error;
  }
};
