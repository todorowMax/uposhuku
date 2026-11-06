import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Hex } from "viem";
import { dealEscrowAbi } from "@/lib/crypto/abi/deal-escrow";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { escrowStageOutcome, verifyEscrowClone, type EscrowSnapshot } from "@/lib/crypto/escrow-chain";
import { checkResolvePercent, journalAction, resolveTransaction } from "@/lib/crypto/escrow-resolve";
import { escrowButtons } from "@/lib/crypto/escrow-ui";
import { applyEscrowState, planEscrowSweep } from "@/lib/deals/escrow-state";
import { applyAction, applyModeratorAction, applyPerformerAction, createDeal, ESCROW_ONCHAIN, validateDraft } from "@/lib/deals/machine";
import type { Deal } from "@/lib/deals/types";
import { CHAIN, CLIENT_WALLET, draft, FACTORY, PERFORMER_WALLET, STRANGER, UNIT } from "../helpers/escrow-fixtures";

describe("чисті функції ескроу", () => {
  const accepted = (): Deal => ({ ...createDeal("deal_pure", draft(), 1_000), status: "accepted", acceptedAt: new Date(1_000).toISOString() });

  it("applyEscrowState: стан контракту переводить етап, повтор нічого не міняє", () => {
    const deal = accepted();
    const funded = applyEscrowState(deal, { stageId: deal.stages[0].id, outcome: { kind: "funded", deliverBy: 5_000 }, now: 2_000 })!;
    expect(funded.stages[0]).toMatchObject({ status: "funded", deliverBy: new Date(5_000_000).toISOString() });
    expect(applyEscrowState(funded, { stageId: deal.stages[0].id, outcome: { kind: "funded", deliverBy: 5_000 }, now: 3_000 })).toBeUndefined();
    const delivered = applyEscrowState(funded, { stageId: deal.stages[0].id, outcome: { kind: "delivered", reviewEnds: 9_000 }, now: 4_000 })!;
    expect(delivered.stages[0]).toMatchObject({ status: "delivered", reviewEnds: new Date(9_000_000).toISOString() });
    const disputed = applyEscrowState(delivered, { stageId: deal.stages[0].id, outcome: { kind: "disputed" }, now: 5_000 })!;
    expect(disputed.disputed).toBe(true);
    expect(disputed.stages[0].status).toBe("disputed");
  });

  it("закрито з виплатою це released із сумою, без виплати refunded і угода скасована; закритий етап не змінюється", () => {
    const deal = accepted();
    const first = deal.stages[0].id;
    const released = applyEscrowState(deal, { stageId: first, outcome: { kind: "released", paid: 10n * UNIT }, now: 9_000 })!;
    expect(released.stages[0]).toMatchObject({ status: "released", paidUnits: "10000000" });
    expect(released.status).toBe("accepted");
    expect(applyEscrowState(released, { stageId: first, outcome: { kind: "refunded" }, now: 9_500 })).toBeUndefined();
    const second = deal.stages[1].id;
    const done = applyEscrowState(released, { stageId: second, outcome: { kind: "released", paid: 5n * UNIT }, now: 9_900 })!;
    expect(done).toMatchObject({ status: "completed", disputed: false });
    const refunded = applyEscrowState(deal, { stageId: first, outcome: { kind: "refunded" }, now: 9_000 })!;
    expect(refunded).toMatchObject({ status: "cancelled" });
    expect(refunded.stages[0].status).toBe("refunded");
  });

  it("applyEscrowState не чіпає не-ескроу угоди й стан «немає контракту»", () => {
    const direct = { ...accepted(), method: "direct" as const };
    expect(applyEscrowState(direct, { stageId: direct.stages[0].id, outcome: { kind: "funded", deliverBy: 1 }, now: 1 })).toBeUndefined();
    const deal = accepted();
    expect(applyEscrowState(deal, { stageId: deal.stages[0].id, outcome: { kind: "none" }, now: 1 })).toBeUndefined();
  });

  it("дії машини над ескроу не міняють статус: відповідь ESCROW_ONCHAIN", () => {
    const funded = applyEscrowState(accepted(), { stageId: "deal_pure-s1", outcome: { kind: "funded", deliverBy: 5_000 }, now: 2_000 })!;
    for (const action of ["release", "dispute", "claim_paid", "fund"] as const) expect(applyAction(funded, action, undefined, 3_000)).toBe(ESCROW_ONCHAIN);
    for (const action of ["deliver", "confirm_paid"] as const) expect(applyPerformerAction(funded, action, undefined, 3_000)).toBe(ESCROW_ONCHAIN);
    const disputed = applyEscrowState(funded, { stageId: "deal_pure-s1", outcome: { kind: "disputed" }, now: 4_000 })!;
    for (const action of ["release", "refund", "partial", "rework"] as const) expect(typeof applyModeratorAction(disputed, action, undefined, 5_000, { percent: 50, confirm: true })).toBe("string");
  });

  it("validateDraft для ескроу: ціле USDT, стеля, вікно здачі; без стелі ескроу недоступне", () => {
    expect(validateDraft(draft(), false, null)).toMatch(/недоступне/);
    expect(validateDraft(draft(), false, 100)).toBeNull();
    expect(validateDraft(draft(), false, 25)).toMatch(/не більша за 25/);
    expect(validateDraft(draft({ stages: [{ title: "x", amount: 10.5, days: 5 }] }), false, 100)).toMatch(/ціле/);
    expect(validateDraft(draft({ stages: [{ title: "x", amount: 10, days: 400 }] }), false, 100)).toMatch(/Термін/);
    expect(validateDraft(draft({ stages: [{ title: "x", amount: 1, days: 1 }] }), false, 100)).toBeNull();
  });

  it("planEscrowSweep: звірка етапів із клоном і нагадування по одному разу", () => {
    const deal = accepted();
    const withClone: Deal = {
      ...deal,
      stages: deal.stages.map((stage, index) => (index === 0 ? { ...stage, status: "delivered", escrow: { address: STRANGER, client: CLIENT_WALLET }, reviewEnds: new Date(10_000).toISOString() } : stage)),
    };
    expect(planEscrowSweep(withClone, 5_000).map((item) => item.kind)).toEqual(["sync"]);
    expect(planEscrowSweep(withClone, 20_000).map((item) => item.kind)).toEqual(["sync", "remind_performer_review_ended"]);
    const reminded: Deal = { ...withClone, stages: withClone.stages.map((stage) => ({ ...stage, reviewEndedRemindedAt: "x" })) };
    expect(planEscrowSweep(reminded, 20_000).map((item) => item.kind)).toEqual(["sync"]);
    const late: Deal = { ...deal, stages: deal.stages.map((stage, index) => (index === 0 ? { ...stage, status: "funded", escrow: { address: STRANGER, client: CLIENT_WALLET }, deliverBy: new Date(10_000).toISOString() } : stage)) };
    expect(planEscrowSweep(late, 20_000).map((item) => item.kind)).toEqual(["sync", "remind_customer_delivery_late"]);
    expect(planEscrowSweep({ ...deal, method: "direct" }, 20_000)).toEqual([]);
  });

  it("escrowButtons: кнопки за роллю, станом і строками", () => {
    const now = 1_000;
    expect(escrowButtons({ role: "customer", stage: { status: "pending" }, nowSeconds: now })).toMatchObject({ deposit: true, deliver: false });
    expect(escrowButtons({ role: "performer", stage: { status: "pending" }, nowSeconds: now }).deposit).toBe(false);
    expect(escrowButtons({ role: "performer", stage: { status: "funded", deliverBy: new Date(2_000_000).toISOString() }, nowSeconds: now })).toMatchObject({ deliver: true, settle: null, dispute: true });
    expect(escrowButtons({ role: "customer", stage: { status: "funded", deliverBy: new Date(500_000).toISOString() }, nowSeconds: now })).toMatchObject({ settle: "refund", deliver: false });
    expect(escrowButtons({ role: "customer", stage: { status: "delivered", reviewEnds: new Date(2_000_000).toISOString() }, nowSeconds: now })).toMatchObject({ release: true, settle: null });
    expect(escrowButtons({ role: "performer", stage: { status: "delivered", reviewEnds: new Date(500_000).toISOString() }, nowSeconds: now })).toMatchObject({ release: false, settle: "claim" });
    expect(escrowButtons({ role: "customer", stage: { status: "disputed" }, nowSeconds: now })).toMatchObject({ deposit: false, dispute: false, settle: null });
  });

  it("resolve: відсоток кратний 5, calldata розбирається назад, дія журналу", () => {
    expect(checkResolvePercent(55)).toBe(55);
    for (const bad of [-5, 101, 12, 50.5, "50", null]) expect(typeof checkResolvePercent(bad)).toBe("string");
    const tx = resolveTransaction({ escrow: STRANGER as Hex, chainId: CHAIN, percent: 70 });
    expect(tx).toMatchObject({ to: STRANGER, chainId: CHAIN, value: "0" });
    expect(decodeFunctionData({ abi: dealEscrowAbi, data: tx.data })).toMatchObject({ functionName: "resolve", args: [70] });
    expect([journalAction(100), journalAction(0), journalAction(35)]).toEqual(["release", "refund", "partial"]);
  });

  it("verifyEscrowClone: чужа фабрика, сторони, сума й посилання відхиляються", () => {
    const ref = dealRefOf("d", "s");
    const base: EscrowSnapshot = { state: 1, client: CLIENT_WALLET, performer: PERFORMER_WALLET, factory: FACTORY, amount: 5n, paidToPerformer: 0n, dealRef: ref, deliverBy: 1, reviewEnds: 0 };
    const expected = { factory: FACTORY as Hex, client: CLIENT_WALLET, performer: PERFORMER_WALLET, amount: 5n, dealRef: ref };
    expect(verifyEscrowClone(base, expected)).toEqual({ ok: true });
    expect(verifyEscrowClone({ ...base, factory: STRANGER }, expected)).toMatchObject({ reason: "wrong_factory" });
    expect(verifyEscrowClone({ ...base, performer: STRANGER }, expected)).toMatchObject({ reason: "wrong_party" });
    expect(verifyEscrowClone({ ...base, client: STRANGER }, expected)).toMatchObject({ reason: "wrong_party" });
    expect(verifyEscrowClone({ ...base, amount: 6n }, expected)).toMatchObject({ reason: "wrong_amount" });
    expect(verifyEscrowClone({ ...base, dealRef: dealRefOf("d", "other") }, expected)).toMatchObject({ reason: "wrong_ref" });
    expect(escrowStageOutcome({ ...base, state: 1 })).toEqual({ kind: "funded", deliverBy: 1 });
  });
});
