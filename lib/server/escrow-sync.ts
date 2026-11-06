// lib/server/escrow-sync.ts
//
// Звірка етапу ескроу зі станом контракту. Адресу клона сервер рахує сам (predictEscrow за гаманцем замовника й
// посиланням на етап), перевіряє в клона фабрику, сторони, суму й dealRef і лише тоді переносить стан контракту в
// етап (applyEscrowState). Слову клієнта не віримо: він лише каже, з якого гаманця вносив. Мережа недоступна:
// стан не міняємо.

import { isAddress, getAddress, type Address } from "viem";
import { CLONE_REJECTION_TEXT, EscrowNotFoundError, escrowStageOutcome, predictEscrowAddress, readEscrow, verifyEscrowClone } from "@/lib/crypto/escrow-chain";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { EvmUnavailableError } from "@/lib/crypto/evm";
import { USDT_DECIMALS } from "@/lib/crypto/units";
import { applyEscrowState, isOpenEscrowStage } from "@/lib/deals/escrow-state";
import { performerUserId } from "@/lib/deals/parties";
import type { Deal, DealStage } from "@/lib/deals/types";
import { addSystemMessage } from "./chat-repo";
import { cryptoConfig } from "./crypto-config";
import { getDealById, mutateDeal, ownerOfDeal } from "./deal-repo";
import { notifyLater } from "./notify";
import { pushUser } from "./realtime";
import { dealWalletAddress } from "./requisites-repo";
import { dealNotice } from "@/lib/telegram/notices";

export type EscrowSyncResult =
  | { ok: true; deal: Deal; changed: boolean; funded: boolean }
  | { ok: false; status: 404 | 409 | 503; title: string; detail: string };

const fail = (status: 404 | 409 | 503, title: string, detail: string): EscrowSyncResult => ({ ok: false, status, title, detail });

const UNIT = 10n ** BigInt(USDT_DECIMALS);

/** Сума етапу в мінімальних одиницях токена: етапи ескроу цілі USDT. */
export const stageUnits = (stage: Pick<DealStage, "amount">): bigint => BigInt(stage.amount) * UNIT;

export interface EscrowSyncInput {
  dealId: string;
  stageId: string;
  /** Гаманець, з якого замовник вносив: потрібен лише до першої звірки етапу. */
  client?: string;
  now?: number;
}

const NOTICE: Partial<Record<DealStage["status"], { action: string; line: (n: string) => string }>> = {
  funded: { action: "escrow_funded", line: (n) => `Кошти за угодою ${n} внесено в ескроу` },
  delivered: { action: "escrow_delivered", line: (n) => `Виконавець здав етап за угодою ${n} (ескроу)` },
  disputed: { action: "escrow_disputed", line: (n) => `За угодою ${n} відкрито спір (ескроу)` },
  released: { action: "escrow_released", line: (n) => `Етап за угодою ${n} виплачено виконавцю (ескроу)` },
  refunded: { action: "escrow_refunded", line: (n) => `Кошти за угодою ${n} повернено замовнику (ескроу)` },
};

/** Повідомити сторони про етап, що змінився. Збій сповіщення нічого не відкочує. */
const announce = async (before: Deal, after: Deal, stageId: string): Promise<void> => {
  const was = before.stages.find((item) => item.id === stageId)?.status;
  const stage = after.stages.find((item) => item.id === stageId);
  const notice = stage ? NOTICE[stage.status] : undefined;
  if (!stage || !notice || was === stage.status) return;
  const owner = await ownerOfDeal(after.id);
  const performer = performerUserId(after.performer.id);
  if (owner && performer) await addSystemMessage(owner, performer, notice.line(after.number), after.id);
  for (const userId of [owner, performer]) {
    const built = dealNotice({ dealId: after.id, action: notice.action, conversationId: after.conversationId });
    if (userId && built) notifyLater(userId, { ...built, key: `${built.key}:${stageId}:${userId}` });
    pushUser(userId, { t: "deal", requestId: after.requestId });
  }
};

/** Адреса клона: уже відома з етапу або вирахувана через predictEscrow за гаманцем замовника. */
const cloneAddress = async (input: { rpcUrl: string; factory: Address; stage: DealStage; dealRef: `0x${string}`; client?: string }): Promise<{ address: Address; client: Address } | string> => {
  const { rpcUrl, factory, stage, dealRef } = input;
  if (stage.escrow) return { address: getAddress(stage.escrow.address), client: getAddress(stage.escrow.client) };
  if (!input.client || !isAddress(input.client, { strict: false })) return "Вкажіть гаманець, з якого вносили кошти.";
  const client = getAddress(input.client.toLowerCase());
  return { address: await predictEscrowAddress({ rpcUrl, factory, client, dealRef }), client };
};

export const syncEscrowStage = async (input: EscrowSyncInput): Promise<EscrowSyncResult> => {
  const { dealId, stageId, now = Date.now() } = input;
  const config = cryptoConfig();
  if (!config?.factory) return fail(409, "Ескроу недоступне", "Ескроу ще не налаштовано.");
  const deal = await getDealById(dealId);
  if (!deal || deal.method !== "escrow") return fail(404, "Угоду не знайдено", "");
  const stage = deal.stages.find((item) => item.id === stageId);
  if (!stage || deal.status !== "accepted" || !isOpenEscrowStage(stage)) return { ok: true, deal, changed: false, funded: stage?.status !== "pending" };
  const wallet = await dealWalletAddress(deal.id, now);
  if (!wallet) return fail(409, "Адреси гаманця виконавця немає", "Виконавець не підтвердив адресу гаманця для цієї угоди.");
  const dealRef = dealRefOf(deal.id, stage.id);
  try {
    const clone = await cloneAddress({ rpcUrl: config.rpcUrl, factory: config.factory, stage, dealRef, client: input.client });
    if (typeof clone === "string") return fail(409, "Потрібен гаманець замовника", clone);
    // Клона за цією адресою ще немає: замовник не вносив (або вказав не той гаманець). Це не помилка.
    const snapshot = await readEscrow(config.rpcUrl, clone.address).catch((error: unknown) => (error instanceof EscrowNotFoundError ? null : Promise.reject(error)));
    if (!snapshot) return { ok: true, deal, changed: false, funded: false };
    const outcome = escrowStageOutcome(snapshot);
    if (outcome.kind === "none") return { ok: true, deal, changed: false, funded: false };
    const verdict = verifyEscrowClone(snapshot, { factory: config.factory, client: clone.client, performer: wallet, amount: stageUnits(stage), dealRef });
    if (!verdict.ok) return fail(409, "Контракт не підходить", CLONE_REJECTION_TEXT[verdict.reason]);
    const result = await mutateDeal(
      deal.id,
      (current) => {
        const target = current.stages.find((item) => item.id === stageId);
        if (!target) return undefined;
        const withClone: Deal = target.escrow ? current : { ...current, stages: current.stages.map((item) => (item.id === stageId ? { ...item, escrow: { address: clone.address, client: clone.client } } : item)) };
        return applyEscrowState(withClone, { stageId, outcome, now }) ?? (withClone === current ? undefined : withClone);
      },
      now,
    );
    if (result === null) return fail(404, "Угоду не знайдено", "");
    if (typeof result === "string") return fail(409, "Угоду щойно змінили", result);
    if (result.changed) await announce(deal, result.deal, stageId);
    return { ok: true, deal: result.deal, changed: result.changed, funded: true };
  } catch (error) {
    if (error instanceof EvmUnavailableError) return fail(503, "Мережа не відповіла", "Не вдалося прочитати контракт. Спробуйте пізніше.");
    throw error;
  }
};
