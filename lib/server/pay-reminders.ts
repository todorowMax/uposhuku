// lib/server/pay-reminders.ts
//
// Крок cron (/api/internal/tick): нагадати обом сторонам прямої угоди, що етап тиждень чекає позначки оплати.
// Що й коли нагадувати, вирішує чиста payReminderDue (lib/deals/pay-reminders.ts); тут вибірка угод, мітка в етапі
// (один раз на нагадування навіть при гонці) і сповіщення через звичайний диспетчер, який поважає налаштування й тихі години.

import { and, asc, eq, like } from "drizzle-orm";
import { deals } from "@/db/schema";
import { payReminderDue } from "@/lib/deals/pay-reminders";
import { performerUserId } from "@/lib/deals/parties";
import type { Deal } from "@/lib/deals/types";
import { payReminderNotice, type PayReminderRole } from "@/lib/telegram/notices";
import { logServer } from "@/lib/telemetry/log";
import { getDb } from "./db";
import { mutateDeal } from "./deal-repo";
import { notifyLater } from "./notify";

/** Скільки угод нагадуємо за один запуск і скільки переглядаємо. */
export const PAY_REMINDER_LIMIT = 50;
const SCAN_LIMIT = 300;
/** Скільки сторінок по SCAN_LIMIT угод переглядаємо за запуск, щоб не затримувати решту кроків. */
const MAX_PAGES = 10;

export interface PayReminderReport {
  deals: number;
  errors: number;
}

/** Сторінка прийнятих прямих угод, давно змінені першими: мітка нагадування оновлює угоду й відправляє її в кінець черги. */
const candidates = async (page: number): Promise<{ deal: Deal; ownerUserId: string }[]> =>
  (
    await getDb()
      .select()
      .from(deals)
      .where(and(eq(deals.status, "accepted"), like(deals.data, '%"method":"direct"%')))
      .orderBy(asc(deals.updatedAt), asc(deals.id))
      .limit(SCAN_LIMIT)
      .offset(page * SCAN_LIMIT)
  ).map((row) => ({ deal: JSON.parse(row.data) as Deal, ownerUserId: row.ownerUserId }));

/** Ставить мітку нагадування; повертає номер лише тому виклику, який її поставив (інакше null). */
const mark = async (dealId: string, now: number): Promise<{ deal: Deal; stageId: string; number: number } | null> => {
  let due: { stageId: string; number: number } | null = null;
  const result = await mutateDeal(
    dealId,
    (current) => {
      due = payReminderDue(current, now);
      if (!due) return undefined;
      const { stageId, number } = due;
      return { ...current, stages: current.stages.map((stage) => (stage.id === stageId ? { ...stage, payRemindedAt: new Date(now).toISOString(), payReminders: number } : stage)) };
    },
    now,
  );
  if (result === null || typeof result === "string" || !result.changed || !due) return null;
  const { stageId, number } = due;
  return { deal: result.deal, stageId, number };
};

const send = (input: { deal: Deal; ownerUserId: string; stageId: string; number: number }): void => {
  const { deal, ownerUserId, stageId, number } = input;
  const stage = deal.stages.find((item) => item.id === stageId);
  if (!stage) return;
  const parties: [string | null, PayReminderRole][] = [
    [ownerUserId, "customer"],
    [performerUserId(deal.performer.id), "performer"],
  ];
  for (const [userId, role] of parties) {
    if (!userId) continue;
    const notice = payReminderNotice({ dealId: deal.id, stageId, stageTitle: stage.title, number, role, conversationId: deal.conversationId });
    notifyLater(userId, { ...notice, key: `${notice.key}:${userId}` });
  }
};

const remindOne = async (item: { deal: Deal; ownerUserId: string }, now: number, report: PayReminderReport): Promise<void> => {
  try {
    const marked = await mark(item.deal.id, now);
    if (!marked) return;
    report.deals += 1;
    send({ deal: marked.deal, ownerUserId: item.ownerUserId, stageId: marked.stageId, number: marked.number });
  } catch (error) {
    report.errors += 1;
    logServer({ level: "error", event: "pay_reminder_failed", message: error instanceof Error ? error.message : String(error), detail: { dealId: item.deal.id } });
  }
};

export const runPayReminders = async (now = Date.now()): Promise<PayReminderReport> => {
  const report: PayReminderReport = { deals: 0, errors: 0 };
  for (let page = 0; page < MAX_PAGES && report.deals < PAY_REMINDER_LIMIT; page++) {
    const batch = await candidates(page);
    for (const item of batch) {
      if (report.deals >= PAY_REMINDER_LIMIT) break;
      if (payReminderDue(item.deal, now)) await remindOne(item, now, report);
    }
    if (batch.length < SCAN_LIMIT) break;
  }
  return report;
};
