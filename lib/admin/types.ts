// lib/admin/types.ts
//
// Що адмінка показує про спори: спільні типи сервера й сторінок.

import type { Deal, ModeratorAction } from "@/lib/deals/types";

export const DECISION_LABEL: Record<ModeratorAction, string> = {
  release: "Виплатити виконавцю",
  refund: "Повернути замовнику",
  rework: "Повернути на доопрацювання",
};

export const DECISION_COMMENT_MIN = 10;
export const DECISION_COMMENT_MAX = 1000;

export interface DisputeParty {
  /** Немає акаунта: демо-виконавець із карти. */
  demo: boolean;
  userId: string | null;
  name: string;
  email: string | null;
  specialty: string;
  city: string;
  bio: string;
  photo: string;
  published: boolean;
  joinedAt: string | null;
  lastLoginAt: string | null;
}

export interface DisputeRow {
  dealId: string;
  number: string;
  title: string;
  total: number;
  stageTitle: string;
  stageAmount: number;
  method: Deal["method"];
  customerName: string;
  performerName: string;
  openedAt: string;
  /** Кінець холду відкритого етапу; лише для safe. */
  holdUntil: string | null;
  /** Є, коли спір уже розв'язано. */
  decision: { action: ModeratorAction; at: string } | null;
}

export interface DisputeMessage {
  id: string;
  from: "customer" | "performer";
  kind: "text" | "system";
  text: string;
  at: string;
  contextId: string | null;
  photos: string[];
}

export interface DecisionLogRow {
  id: string;
  stageId: string;
  action: ModeratorAction;
  comment: string;
  adminEmail: string;
  at: string;
}

export interface DisputeCard {
  deal: Deal;
  title: string;
  customer: DisputeParty;
  performer: DisputeParty;
  conversationId: string | null;
  messages: DisputeMessage[];
  log: DecisionLogRow[];
  /** Етап у спорі, якщо він ще відкритий. */
  openStageId: string | null;
}
