// lib/server/deal-announce.ts
//
// Що сказати сторонам, коли етап змінився за словом банку або sweep: рядок у розмові й сповіщення.
// «З найкращих зусиль»: збій сповіщення не відкочує гроші, які вже рухнули.

import { performerUserId } from "@/lib/deals/parties";
import type { Deal, DealStage } from "@/lib/deals/types";
import { dealNotice } from "@/lib/telegram/notices";
import { addSystemMessage } from "./chat-repo";
import { notifyLater } from "./notify";
import { pushUser } from "./realtime";

interface Change {
  action: string;
  line: (number: string) => string;
}

/** Нова позначка етапу → що повідомити. Етапи, які не змінилися, мовчать. */
const changeOf = (before: DealStage | undefined, after: DealStage): Change | null => {
  if (!before || before.status === after.status) return null;
  switch (after.status) {
    case "funded":
      return before.status === "pending" ? { action: "paid", line: (n) => `Кошти за угодою ${n} заморожено в банку` } : null;
    case "released":
      return { action: "payout_done", line: (n) => `Банк підтвердив виплату виконавцю за угодою ${n}` };
    case "refunded":
      return { action: "refund_done", line: (n) => `Банк підтвердив повернення коштів замовнику за угодою ${n}` };
    default:
      return null;
  }
};

/** Повідомити про всі етапи, що змінилися між двома версіями угоди. */
export const announceDealChange = async (input: { before: Deal; after: Deal; ownerUserId: string }): Promise<void> => {
  const { before, after, ownerUserId } = input;
  const performer = performerUserId(after.performer.id);
  for (const stage of after.stages) {
    const change = changeOf(
      before.stages.find((item) => item.id === stage.id),
      stage,
    );
    if (!change) continue;
    if (performer) await addSystemMessage(ownerUserId, performer, change.line(after.number), after.id);
    for (const userId of [ownerUserId, performer]) {
      const notice = dealNotice({ dealId: after.id, action: change.action, conversationId: after.conversationId });
      if (userId && notice) notifyLater(userId, { ...notice, key: `${notice.key}:${stage.id}:${userId}` });
      pushUser(userId, { t: "deal", requestId: after.requestId });
    }
  }
};

/** Одне сповіщення обом сторонам (холд добігає кінця, автоприймання). */
export const notifyParties = (input: { deal: Deal; ownerUserId: string; action: string; stageId: string }): void => {
  const performer = performerUserId(input.deal.performer.id);
  for (const userId of [input.ownerUserId, performer]) {
    const notice = dealNotice({ dealId: input.deal.id, action: input.action, conversationId: input.deal.conversationId });
    if (userId && notice) notifyLater(userId, { ...notice, key: `${notice.key}:${input.stageId}:${userId}` });
    pushUser(userId, { t: "deal", requestId: input.deal.requestId });
  }
};
