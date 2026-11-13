// lib/server/legal-gate.ts
//
// Сервер перевіряє згоди на кожній грошовій дії, а не в одному місці: клієнт лише показує шторку. Повертає
// готову відповідь 409 із кодом або null, якщо можна продовжувати. Читання й чат не перевіряються.

import { problem } from "@/lib/api/problem";
import { LEGAL_REACCEPT_CODE, RISK_ACK_CODE } from "@/lib/legal/codes";
import { pendingFor, riskAccepted } from "./legal-repo";

/** Умови оновилися (або людина їх ще не приймала): гроші стоять, поки не прийме. */
export const legalGate = async (userId: string): Promise<Response | null> =>
  (await pendingFor(userId)).length === 0 ? null : problem(409, "Потрібно прийняти оновлені умови", "Ми оновили умови. Прийміть їх, щоб продовжити.", "/problems/legal-reaccept-required", LEGAL_REACCEPT_CODE);

/** Перша дія з USDT: потрібне підтвердження, що людина розуміє ризики крипти. */
export const riskGate = async (userId: string): Promise<Response | null> =>
  (await riskAccepted(userId)) ? null : problem(409, "Підтвердьте ризики", "Перед дією з USDT підтвердьте, що розумієте ризики.", "/problems/risk-ack-required", RISK_ACK_CODE);

/** Обидві перевірки для дій з USDT: спершу умови, потім ризик. */
export const cryptoGate = async (userId: string): Promise<Response | null> => (await legalGate(userId)) ?? (await riskGate(userId));

/** Вхід без галочки «Мені є 18 років і приймаю умови»: відповідь для email-входу й Google. */
export const termsRequired = (): Response =>
  problem(400, "Потрібна згода з умовами", "Підтвердьте, що вам є 18 років і ви приймаєте умови та політику конфіденційності.", "/problems/terms-required", "terms_required");
