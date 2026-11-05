// POST /api/admin/disputes/:dealId/decision {action, comment, stageId?, percent?, confirm?} — рішення модератора:
// release (виплатити виконавцю), refund (повернути замовнику), rework (на доопрацювання), partial (виплатити
// percent %, кратний 5; потребує confirm: true, бо виплата необоротна: банк не дає повернути виплачену частину).
// Грошові рішення безпечної угоди (release, refund, partial) потребують поля totp: код другого фактора (ADMIN_TOTP_SECRET),
// і про кожне власнику йде лист. rework грошей не рухає й коду не потребує.
// Рішення записує намір (releasing / refunding) і журнал, далі просимо банк; «виплачено» і «повернено»
// ставить лише його підтвердження. Обидві сторони отримують рядок у розмові й сповіщення.

import { problem, readJson } from "@/lib/api/problem";
import { checkComment, decisionLine, MODERATOR_ACTIONS } from "@/lib/admin/decisions";
import type { Deal, DealStage, ModeratorAction } from "@/lib/deals/types";
import { getAdmin } from "@/lib/server/admin";
import { checkSecondFactor, isMoneyDecision, notifyMoneyDecision } from "@/lib/server/admin-money";
import { rateLimited } from "@/lib/server/rate-limit";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { settleMessage, settleStage } from "@/lib/server/deal-money";
import { actAsModerator, getDealById, getDealForOwner } from "@/lib/server/deal-repo";
import { notifyLater } from "@/lib/server/notify";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";
import { dealNotice } from "@/lib/telegram/notices";

/**
 * Рішення з грошима передаємо банку. Відмова банку: етап уже знову у спорі, сторонам про виплату не пишемо,
 * а рішення лишилося в журналі як спроба.
 */
const settleDecision = async (deal: Deal, input: { action: ModeratorAction; stageId: string; ownerUserId: string }): Promise<{ deal: Deal; bankNote: string | null } | { rejected: string }> => {
  if (input.action === "rework" || deal.method !== "safe") return { deal, bankNote: null };
  const note = settleMessage(await settleStage(deal.id, input.stageId));
  if (note?.status === 409) return { rejected: note.detail };
  return { deal: (await getDealForOwner(deal.id, input.ownerUserId)) ?? deal, bankNote: note?.detail ?? null };
};

/** Лист власнику про грошове рішення; збій листа рішення не скасовує. */
const reportMoney = async (input: Parameters<typeof notifyMoneyDecision>[0]): Promise<void> => {
  if (isMoneyDecision(input.deal, input.action)) await notifyMoneyDecision(input).catch(() => undefined);
};

/** Рядок у стрічці пари (бачать обидва) і сповіщення кожному зі своїм ключем, щоб не злилися. */
const announceDecision = async (input: { deal: Deal; stage: DealStage; action: ModeratorAction; ownerUserId: string; decisionId: string; comment: string; percent?: number }): Promise<void> => {
  const { deal, stage, action, ownerUserId, decisionId, comment, percent } = input;
  const performerUserId = deal.performer.id.startsWith("me-") ? deal.performer.id.slice(3) : null;
  if (performerUserId) await addSystemMessage(ownerUserId, performerUserId, decisionLine(deal, stage, action, comment, percent), deal.id);
  const notice = dealNotice({ dealId: deal.id, action: `moderator_${action}`, conversationId: deal.conversationId });
  for (const userId of [ownerUserId, performerUserId]) {
    if (userId && notice) notifyLater(userId, { ...notice, key: `${notice.key}:${decisionId}:${userId}` });
    pushUser(userId, { t: "deal", requestId: deal.requestId });
  }
};

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const limited = await rateLimited("adminDecision", admin.id);
    if (limited) return limited;
    const body = await readJson(request);
    const action = MODERATOR_ACTIONS.find((item): item is ModeratorAction => item === body?.action);
    if (!action) return problem(400, "Невідоме рішення");
    const checked = checkComment(body?.comment);
    if ("error" in checked) return problem(400, "Потрібен коментар", checked.error);
    const percent = typeof body?.percent === "number" ? body.percent : undefined;
    const dealId = (await params).id;
    const target = await getDealById(dealId);
    if (!target) return problem(404, "Не знайдено");
    // Другий фактор перед будь-яким записом: і перед рішенням у журнал, і перед викликом банку.
    if (isMoneyDecision(target, action)) {
      const factor = await checkSecondFactor({ adminId: admin.id, code: body?.totp });
      if (!factor.ok) return problem(factor.status, factor.title, factor.detail);
    }
    const result = await actAsModerator(dealId, action, typeof body?.stageId === "string" ? body.stageId : undefined, { userId: admin.id, email: admin.email, comment: checked.comment, percent, confirm: body?.confirm === true });
    if (result === null) return problem(404, "Не знайдено");
    if (typeof result === "string") return problem(409, "Рішення не застосовано", result);

    const { stage, ownerUserId, decisionId } = result;
    const settled = await settleDecision(result.deal, { action, stageId: stage.id, ownerUserId });
    const report = { deal: result.deal, action, stageAmount: stage.amount, adminEmail: admin.email, percent };
    if ("rejected" in settled) {
      await reportMoney({ ...report, bank: "відмовив, етап знову у спорі" });
      return problem(409, "Банк не виконав рішення", `${settled.rejected} Етап знову у спорі, рішення можна повторити.`);
    }
    const { deal, bankNote } = settled;
    await reportMoney({ ...report, deal, bank: bankNote ?? "прийняв або виконав" });
    await announceDecision({ deal, stage, action, ownerUserId, decisionId, comment: checked.comment, percent });
    return Response.json({ deal, bankNote }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
