// lib/server/account-code.ts
//
// Код з пошти для видалення акаунта людини, у якої були угоди. Та сама таблиця й правила, що в коді приймання етапу
// (lib/server/release-code.ts: SHA-256, 10 хвилин, 5 спроб, лист не частіше разу на хвилину), ціль замість угоди
// службова: dealId = "account", stageId = "delete".

import { sendDeletionCodeMail } from "./mail";
import { sendCode, verifyReleaseCode, type CodeTarget, type SendOutcome, type VerifyOutcome } from "./release-code";

const targetOf = (userId: string): CodeTarget => ({ userId, dealId: "account", stageId: "delete" });

export const sendDeletionCode = (userId: string, email: string): Promise<SendOutcome> => sendCode({ target: targetOf(userId), deliver: (code) => sendDeletionCodeMail(email, code) });

export const verifyDeletionCode = (userId: string, code: unknown): Promise<VerifyOutcome> => verifyReleaseCode(targetOf(userId), code);
