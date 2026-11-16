// lib/chat/draft-limit.ts
//
// Довжина чернетки проти ліміту `CHAT_TEXT_MAX`: лічильник з'являється ближче до межі, а довший текст не надсилається
// (сервер відповів би 413, див. `sendErrorText`).

import { CHAT_TEXT_MAX } from "./types";

/** З якої довжини показуємо лічильник. */
export const COUNTER_FROM = Math.floor(CHAT_TEXT_MAX * 0.9);

export const draftLimit = (length: number): { show: boolean; over: boolean; text: string } => ({
  show: length >= COUNTER_FROM,
  over: length > CHAT_TEXT_MAX,
  text: `${length} з ${CHAT_TEXT_MAX}`,
});
