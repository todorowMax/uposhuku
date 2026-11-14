// lib/server/phone-gate.ts
//
// Ворота телефону: замовник без підтвердженого номера не публікує запит, не пропонує й не приймає угоду, коли прапорець
// `phone_verify` увімкнений для нього. Виконавця не чіпають. Повертає готову відповідь 409 або null (за зразком legal-gate).

import { problem } from "@/lib/api/problem";
import { PHONE_REQUIRED_CODE, PHONE_REQUIRED_DETAIL } from "@/lib/phone/codes";
import { isPhoneRequired } from "./phone-repo";

/** Те саме для роутів, де вхід можуть мати обидві сторони: ворота лише для замовника. */
export const phoneGateForRole = async (role: "customer" | "performer", user: { id: string; email: string }): Promise<Response | null> => (role === "customer" ? phoneGate(user) : null);

export const phoneGate = async (user: { id: string; email: string }): Promise<Response | null> =>
  (await isPhoneRequired(user)) ? problem(409, "Потрібен телефон", PHONE_REQUIRED_DETAIL, "/problems/phone-required", PHONE_REQUIRED_CODE) : null;
