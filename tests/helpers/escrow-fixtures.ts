// tests/helpers/escrow-fixtures.ts
//
// Спільні дані тестів ескроу: адреси, одиниця USDT і чернетка угоди з двома етапами.

import type { DealDraft } from "@/lib/deals/types";

export const CHAIN = 31337;
export const FACTORY = "0x00000000000000000000000000000000000fac01";
export const TOKEN = "0x00000000000000000000000000000000000a1111";
export const PERFORMER_WALLET = "0x00000000000000000000000000000000000d4444";
export const CLIENT_WALLET = "0x00000000000000000000000000000000000c3333";
export const STRANGER = "0x00000000000000000000000000000000000e5555";
export const IBAN = "UA213223130000026007233566001";
export const UNIT = 1_000_000n;
export const KEY = Buffer.alloc(32, 7).toString("base64");

export const draft = (over: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "direct:conv-esc",
  responseId: "direct",
  performer: { id: "me-esc-perf", name: "Виконавець", avatarIndex: 0, specialty: "", fop: false },
  method: "escrow",
  stages: [
    { title: "Перший", amount: 10, days: 5 },
    { title: "Другий", amount: 20, days: 5 },
  ],
  ...over,
});
