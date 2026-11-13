// POST /api/deals/:id/wallet-pay { hash } — оплата USDT з гаманця замовника (прапорець `crypto_wallet`).
// Лише замовник, лише прямий переказ, лише етап, що чекає оплати. Хеш тільки вказує, де дивитися: сервер читає
// квитанцію через CRYPTO_RPC_URL і звіряє мережу, токен, одержувача (підтверджена адреса зі знімка угоди), посилання
// на етап (через FeeRouter), 12 підтверджень, час і унікальність хеша. Успіх: етап `claimed`; підтверджує виконавець,
// бо курс сторін сервер не знає. Мережа недоступна: 503, стан не міняємо.

import { problem, readJson } from "@/lib/api/problem";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import type { CryptoConfig } from "@/lib/crypto/config";
import { evaluateEvmPayment, EVM_REJECTION_TEXT, EvmUnavailableError, isEvmTxHash, readEvmChain, type EvmExpectation, type EvmVerdict } from "@/lib/crypto/evm";
import { evmExplorerLink } from "@/lib/crypto/chains";
import { formatUsdt } from "@/lib/crypto/tron";
import { currentStage } from "@/lib/deals/machine";
import { getSessionUser } from "@/lib/server/auth";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { deleteProof, proofByHash, saveProof } from "@/lib/server/crypto-proof-repo";
import { claimDirectPayment, getDealForOwner } from "@/lib/server/deal-repo";
import { cryptoGate } from "@/lib/server/legal-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { readDealRequisites } from "@/lib/server/requisites-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

const HEADERS = { "cache-control": "no-store" };
const USED = () => problem(409, "Транзакцію вже використано", "За цим хешем оплату вже зараховано.");

type EvmOk = Extract<EvmVerdict, { ok: true }>;

/** Читає транзакцію й оцінює її. Відмова або недоступна мережа повертається готовою відповіддю. */
const judgePayment = async (input: { txHash: string; config: CryptoConfig; expected: Pick<EvmExpectation, "to" | "dealRef" | "acceptedAt"> }): Promise<EvmOk | Response> => {
  const { txHash, config, expected } = input;
  try {
    const chain = await readEvmChain(txHash, config.rpcUrl);
    const verdict = evaluateEvmPayment({ chain, expected: { ...expected, chainId: config.chainId, token: config.token, router: config.router } });
    return verdict.ok ? verdict : problem(409, "Оплату не підтверджено", EVM_REJECTION_TEXT[verdict.reason]);
  } catch (error) {
    if (error instanceof EvmUnavailableError) return problem(503, "Мережа не відповіла", "Не вдалося перевірити транзакцію. Спробуйте пізніше.");
    throw error;
  }
};

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("walletPay", user.id);
    if (limited) return limited;
    const config = await walletConfigFor(user.email);
    if (!config) return problem(409, "Оплата з гаманця недоступна", "Оплата з гаманця ще не відкрита для вашого акаунта.");
    const refused = await cryptoGate(user.id);
    if (refused) return refused;
    const hash = (await readJson(request))?.hash;
    if (!isEvmTxHash(hash)) return problem(400, "Хеш некоректний", "Хеш транзакції: 0x і 64 символи 0-9 та a-f.");
    const txHash = hash.toLowerCase();

    const deal = await getDealForOwner((await params).id, user.id);
    if (!deal) return problem(404, "Угоду не знайдено");
    const stage = currentStage(deal);
    if (deal.method !== "direct" || deal.status !== "accepted" || stage?.status !== "pending") return problem(409, "Оплату зараз не приймаємо", "Етап не чекає оплати.");
    const wallet = (await readDealRequisites(deal.id, user.id))?.requisites?.walletAddress;
    if (!wallet) return problem(409, "Адреси гаманця немає", "Виконавець не підтвердив адресу гаманця для цієї угоди.");
    if (await proofByHash(txHash)) return USED();

    const verdict = await judgePayment({ txHash, config, expected: { to: wallet, dealRef: dealRefOf(deal.id, stage.id), acceptedAt: Date.parse(deal.acceptedAt ?? "") || 0 } });
    if (verdict instanceof Response) return verdict;

    const stored = await saveProof({ dealId: deal.id, stageId: stage.id, txHash, proof: verdict.proof, chain: "evm" });
    if (!stored) return USED();
    const claimed = await claimDirectPayment({ userId: user.id, dealId: deal.id, stageId: stage.id, via: "wallet" });
    if (typeof claimed === "string" || claimed === null) {
      await deleteProof(stored.id);
      return problem(409, "Оплату не прийнято", claimed ?? "Угоду не знайдено.");
    }
    return Response.json({ deal: claimed, proof: { stageId: stage.id, amount: formatUsdt(stored.amountUnits), explorerUrl: evmExplorerLink(config.chainId, txHash) } }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
