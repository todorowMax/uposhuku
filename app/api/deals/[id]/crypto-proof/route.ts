// /api/deals/:id/crypto-proof — оплата USDT TRC-20 за хешем транзакції (прапорець `crypto_proof`).
// POST { hash }: лише замовник, лише прямий переказ, лише етап, що чекає оплати. Сервер читає транзакцію в TronGrid
// і перевіряє токен, одержувача зі знімка угоди, 20 підтверджень, час і унікальність хеша. Успіх: етап `claimed`,
// далі виконавець підтверджує отримання, як зазвичай (курс сторін сервер не знає). Мережа недоступна: 503, стан той самий.
// GET: підтверджені оплати угоди для обох сторін (сума й посилання на обозреватель).

import { problem, readJson } from "@/lib/api/problem";
import { evaluateTronTransfer, formatUsdt, isTronTxHash, readTronChain, TRON_REJECTION_TEXT, tronscanLink, TronUnavailableError, type TronVerdict } from "@/lib/crypto/tron";
import { evmExplorerLink } from "@/lib/crypto/chains";
import { cryptoConfig } from "@/lib/server/crypto-config";
import { currentStage } from "@/lib/deals/machine";
import { performerIdOf } from "@/lib/deals/parties";
import { getSessionUser } from "@/lib/server/auth";
import { deleteProof, listDealProofs, proofByHash, saveProof } from "@/lib/server/crypto-proof-repo";
import { claimDirectPayment, getDealById, getDealForOwner } from "@/lib/server/deal-repo";
import { readVar } from "@/lib/server/env";
import { featureEnabledFor } from "@/lib/server/features";
import { rateLimited } from "@/lib/server/rate-limit";
import { readDealRequisites } from "@/lib/server/requisites-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

type TronProofOk = Extract<TronVerdict, { ok: true }>;

const HEADERS = { "cache-control": "no-store" };

/** Читає транзакцію й оцінює її. Відмова або недоступна мережа повертається готовою відповіддю. */
const judgeTransfer = async (txHash: string, address: string, acceptedAt: string | undefined): Promise<TronProofOk | Response> => {
  try {
    const verdict = evaluateTronTransfer({ chain: await readTronChain(txHash, readVar("TRONGRID_API_KEY")), to: address, acceptedAt: Date.parse(acceptedAt ?? "") || 0 });
    return verdict.ok ? verdict : problem(409, "Оплату не підтверджено", TRON_REJECTION_TEXT[verdict.reason]);
  } catch (error) {
    if (error instanceof TronUnavailableError) return problem(503, "Мережа не відповіла", "Не вдалося перевірити транзакцію. Спробуйте пізніше.");
    throw error;
  }
};

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("cryptoProof", user.id);
    if (limited) return limited;
    if (!(await featureEnabledFor("crypto_proof", user.email))) return problem(409, "Оплата USDT недоступна", "Оплата USDT ще не відкрита для вашого акаунта.");
    const hash = (await readJson(request))?.hash;
    if (!isTronTxHash(hash)) return problem(400, "Хеш некоректний", "Хеш транзакції: 64 символи 0-9 і a-f.");
    const txHash = hash.toLowerCase();

    const deal = await getDealForOwner((await params).id, user.id);
    if (!deal) return problem(404, "Угоду не знайдено");
    const stage = currentStage(deal);
    if (deal.method !== "direct" || deal.status !== "accepted" || stage?.status !== "pending") return problem(409, "Оплату зараз не приймаємо", "Етап не чекає оплати.");
    const address = (await readDealRequisites(deal.id, user.id))?.requisites?.usdtTrc20;
    if (!address) return problem(409, "Адреси USDT немає", "Виконавець не вказав адресу USDT TRC-20 для цієї угоди.");
    if (await proofByHash(txHash)) return problem(409, "Транзакцію вже використано", "За цим хешем оплату вже зараховано.");

    const verdict = await judgeTransfer(txHash, address, deal.acceptedAt);
    if (verdict instanceof Response) return verdict;
    const stored = await saveProof({ dealId: deal.id, stageId: stage.id, txHash, proof: verdict.proof });
    if (!stored) return problem(409, "Транзакцію вже використано", "За цим хешем оплату вже зараховано.");
    const claimed = await claimDirectPayment({ userId: user.id, dealId: deal.id, stageId: stage.id, via: "usdt" });
    if (typeof claimed === "string" || claimed === null) {
      await deleteProof(stored.id);
      return problem(409, "Оплату не прийнято", claimed ?? "Угоду не знайдено.");
    }
    return Response.json({ deal: claimed, proof: { stageId: stage.id, amount: formatUsdt(stored.amountUnits), explorerUrl: tronscanLink(txHash) } }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const deal = await getDealById((await params).id);
    const isParty = deal && ((await getDealForOwner(deal.id, user.id)) !== null || deal.performer.id === performerIdOf(user.id));
    if (!deal || !isParty) return problem(404, "Угоду не знайдено");
    const chainId = cryptoConfig()?.chainId;
    const proofs = (await listDealProofs(deal.id)).map((item) => ({ stageId: item.stageId, amount: formatUsdt(item.amountUnits), from: item.fromAddress, confirmations: item.confirmations, chain: item.chain, explorerUrl: item.chain === "evm" ? evmExplorerLink(chainId ?? 0, item.txHash) : tronscanLink(item.txHash) }));
    return Response.json({ proofs }, { headers: HEADERS });
  } catch (error) {
    return failure(error, request);
  }
};
