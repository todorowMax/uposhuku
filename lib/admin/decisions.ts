// lib/admin/decisions.ts
//
// Тексти рішення модератора: рядок у стрічці розмови й перевірка коментаря.

import type { Deal, DealStage, ModeratorAction } from "@/lib/deals/types";
import { DECISION_COMMENT_MAX, DECISION_COMMENT_MIN } from "./types";

export const MODERATOR_ACTIONS: ModeratorAction[] = ["release", "refund", "rework", "partial"];

/** Коментар модератора або текст помилки. */
export const checkComment = (raw: unknown): { comment: string } | { error: string } => {
  const comment = typeof raw === "string" ? raw.trim() : "";
  if (comment.length < DECISION_COMMENT_MIN) return { error: `Поясніть рішення: хоча б ${DECISION_COMMENT_MIN} символів.` };
  if (comment.length > DECISION_COMMENT_MAX) return { error: `Коментар задовгий: до ${DECISION_COMMENT_MAX} символів.` };
  return { comment };
};

const OUTCOME: Record<ModeratorAction, (stage: string, percent?: number) => string> = {
  release: (stage) => `етап «${stage}» виплачується виконавцю`,
  partial: (stage, percent) => `виконавцю виплачується ${percent}% за етап «${stage}», решта виконавцю не виплачується`,
  refund: (stage) => `кошти за етап «${stage}» повертаються замовнику, угоду закрито`,
  rework: (stage) => `етап «${stage}» повернуто виконавцю на доопрацювання`,
};

/** Рядок у стрічці розмови: його бачать обидві сторони. */
export const decisionLine = (deal: Pick<Deal, "number">, stage: Pick<DealStage, "title">, action: ModeratorAction, comment: string, percent?: number): string =>
  `Модератор розглянув спір за угодою ${deal.number}: ${OUTCOME[action](stage.title, percent)}. Коментар модератора: ${comment}`;
