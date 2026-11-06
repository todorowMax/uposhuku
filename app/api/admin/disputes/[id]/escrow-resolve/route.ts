// POST /api/admin/disputes/:dealId/escrow-resolve {stageId?, percent, comment} — підготовка рішення спору ескроу.
// Сервер НЕ підписує й не шле транзакцій: він віддає адресу клона, мережу й calldata resolve(percent) для
// мультипідпису (Safe) і пише рішення в журнал. Статус етапу змінить сверка після виконання транзакції в мережі.
// Другий фактор не потрібен: підпис у Safe його заміняє.

import { problem, readJson } from "@/lib/api/problem";
import { checkComment } from "@/lib/admin/decisions";
import { checkResolvePercent, journalAction, resolveTransaction } from "@/lib/crypto/escrow-resolve";
import { disputedStage } from "@/lib/deals/machine";
import { moderationActions } from "@/db/schema";
import { getAdmin } from "@/lib/server/admin";
import { cryptoConfig } from "@/lib/server/crypto-config";
import { getDb } from "@/lib/server/db";
import { getDealById } from "@/lib/server/deal-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const limited = await rateLimited("adminDecision", admin.id);
    if (limited) return limited;
    const body = await readJson(request);
    const checked = checkComment(body?.comment);
    if ("error" in checked) return problem(400, "Потрібен коментар", checked.error);
    const percent = checkResolvePercent(body?.percent);
    if (typeof percent === "string") return problem(400, "Відсоток некоректний", percent);
    const dealId = (await params).id;
    const deal = await getDealById(dealId);
    if (!deal || deal.method !== "escrow") return problem(404, "Не знайдено");
    const stage = typeof body?.stageId === "string" ? deal.stages.find((item) => item.id === body.stageId) : disputedStage(deal);
    if (!stage || stage.status !== "disputed") return problem(409, "Рішення не підготовлено", "Цей етап не в спорі: спершу дочекайтеся звірки з контрактом.");
    if (!stage.escrow) return problem(409, "Рішення не підготовлено", "Адреса контракту етапу ще невідома: виконайте звірку.");
    const config = cryptoConfig();
    if (!config) return problem(409, "Ескроу недоступне", "Ескроу ще не налаштовано.");
    const transaction = resolveTransaction({ escrow: stage.escrow.address as `0x${string}`, chainId: config.chainId, percent });
    // У журналі лишається відсоток у коментарі, як у частковій виплаті банківських спорів.
    const logged = `[ескроу: resolve(${percent}%), підготовлено для мультипідпису] ${checked.comment}`;
    await getDb().insert(moderationActions).values({ id: `mod_${crypto.randomUUID().slice(0, 10)}`, dealId, stageId: stage.id, action: journalAction(percent), comment: logged, adminUserId: admin.id, adminEmail: admin.email, createdAt: Date.now() });
    return Response.json({ transaction, stageId: stage.id, percent }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
