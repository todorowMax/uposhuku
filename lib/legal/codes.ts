// lib/legal/codes.ts
//
// Стабільні коди відмов 409, спільні для сервера (lib/server/legal-gate.ts) і браузера (lib/legal/client.ts).

/** Умови оновилися чи ще не прийняті: гроші стоять, поки людина не прийме. */
export const LEGAL_REACCEPT_CODE = "legal_reaccept_required";

/** Перша дія з USDT: потрібне підтвердження, що людина розуміє ризики. */
export const RISK_ACK_CODE = "risk_ack_required";
