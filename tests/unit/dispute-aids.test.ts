import { describe, expect, it } from "vitest";
import { dealTimeline } from "@/lib/admin/deal-timeline";
import { stageState } from "@/lib/admin/format";
import { checkComplaint, complaintStageError } from "@/lib/deals/complaints";
import { checkCriteria, checkDelivery, normalizeDeliveryLink, withDelivery, withReceipt } from "@/lib/deals/dispute-aids";
import { DISPUTE_TIPS } from "@/components/deals/dispute-tips";
import { applyAction, applyModeratorAction, applyPerformerAction, createDeal } from "@/lib/deals/machine";
import type { DealDraft } from "@/lib/deals/types";

const T0 = Date.parse("2026-11-06T10:00:00Z");
const performer = { id: "me-perf", name: "Юлія", avatarIndex: 0, specialty: "", fop: false };
const draft = (over: Partial<DealDraft> = {}): DealDraft => ({ requestId: "r", responseId: "x", performer, method: "direct", stages: [{ title: "Робота", amount: 1000, days: 5 }], ...over });

describe("критерії готовності", () => {
  it("зберігаються в угоді обрізаними, порожні не пишуться, задовгі відхиляються", () => {
    expect(createDeal("d1", draft({ criteria: "  Макет і верстка " }), T0).criteria).toBe("Макет і верстка");
    expect(createDeal("d1", draft({ criteria: "   " }), T0)).not.toHaveProperty("criteria");
    expect(checkCriteria("x".repeat(500))).toMatchObject({ ok: true });
    expect(checkCriteria("x".repeat(501))).toMatchObject({ ok: false });
    expect(checkCriteria(42)).toMatchObject({ ok: false });
  });

  it("не змінюються жодною дією: прийняття, оплата, здача, спір, рішення модератора", () => {
    const base = createDeal("d1", draft({ criteria: "Лендинг, що відкривається на телефоні", method: "direct" }), T0);
    const accepted = applyPerformerAction(base, "accept", undefined, T0) as typeof base;
    const claimed = applyAction(accepted, "claim_paid", undefined, T0) as typeof base;
    const funded = applyPerformerAction(claimed, "confirm_paid", undefined, T0) as typeof base;
    const delivered = applyPerformerAction(funded, "deliver", undefined, T0) as typeof base;
    const released = applyAction(delivered, "release", undefined, T0) as typeof base;
    for (const deal of [accepted, claimed, funded, delivered, released]) expect(deal.criteria).toBe("Лендинг, що відкривається на телефоні");
    const safe = createDeal("d2", draft({ method: "safe", performer: { ...performer, fop: true }, criteria: "Готово = макет" }), T0);
    const disputed = { ...safe, status: "accepted" as const, stages: safe.stages.map((s) => ({ ...s, status: "disputed" as const })) };
    const reworked = applyModeratorAction(disputed, "rework", undefined, T0, {}) as typeof safe;
    expect(reworked.criteria).toBe("Готово = макет");
  });
});

describe("результат етапу", () => {
  it("посилання лише https, без логіна, з крапкою в хості", () => {
    expect(normalizeDeliveryLink("https://drive.example.com/f/1")).toBe("https://drive.example.com/f/1");
    for (const bad of ["http://example.com", "javascript:alert(1)", "https://user:pw@example.com", "https://localhost/x", "example.com", "ftp://example.com"]) {
      expect(normalizeDeliveryLink(bad), bad).toBeNull();
    }
  });

  it("checkDelivery: порожнє це «нічого», неправильне посилання й довгий текст відхиляються", () => {
    expect(checkDelivery("", "")).toEqual({ ok: true, value: undefined });
    expect(checkDelivery(" Готово ", "https://example.com/a")).toEqual({ ok: true, value: { text: "Готово", link: "https://example.com/a" } });
    expect(checkDelivery("", "http://example.com")).toMatchObject({ ok: false });
    expect(checkDelivery("x".repeat(1001), "")).toMatchObject({ ok: false });
    expect(checkDelivery({}, "")).toMatchObject({ ok: false });
  });

  it("withDelivery і withReceipt пишуть лише в потрібний етап", () => {
    const deal = createDeal("d1", draft({ stages: [{ title: "А", amount: 600, days: 1 }, { title: "Б", amount: 600, days: 1 }] }), T0);
    const [first, second] = deal.stages;
    const next = withReceipt(withDelivery(deal, second.id, { text: "ок" }), first.id, { attachmentId: "att_1", now: T0 });
    expect(next.stages[0]).toMatchObject({ receiptAttachmentId: "att_1" });
    expect(next.stages[0].delivery).toBeUndefined();
    expect(next.stages[1].delivery).toEqual({ text: "ок" });
    expect(withDelivery(deal, first.id, undefined)).toBe(deal);
  });
});

describe("скарга", () => {
  it("перевірка причини й тексту", () => {
    expect(checkComplaint("quality", "Робота не схожа на домовлену")).toMatchObject({ ok: true });
    expect(checkComplaint("вигадана", "Достатньо довгий текст")).toMatchObject({ ok: false });
    expect(checkComplaint("other", "коротко")).toMatchObject({ ok: false });
    expect(checkComplaint("other", "x".repeat(1001))).toMatchObject({ ok: false });
  });

  it("лише для прямого переказу, прийнятої угоди й етапу після позначки оплати", () => {
    expect(complaintStageError({ method: "direct", status: "accepted" }, { status: "claimed" })).toBeNull();
    expect(complaintStageError({ method: "direct", status: "accepted" }, { status: "pending" })).toMatch(/оплату/);
    expect(complaintStageError({ method: "safe", status: "accepted" }, { status: "funded" })).toMatch(/прямим переказом/);
    expect(complaintStageError({ method: "direct", status: "proposed" }, { status: "claimed" })).toMatch(/не прийнято/);
    expect(complaintStageError({ method: "direct", status: "accepted" }, undefined)).toMatch(/не знайдено/);
  });
});

describe("хронологія угоди", () => {
  it("збирає всі позначки часу за порядком, із транзакцією, чеком, результатом, критеріями й маскою", () => {
    const base = createDeal("d1", draft({ criteria: "Лендинг" }), T0);
    const deal = {
      ...base,
      status: "accepted" as const,
      acceptedAt: new Date(T0 + 1000).toISOString(),
      stages: [{ ...base.stages[0], status: "delivered" as const, paidVia: "usdt" as const, claimedAt: new Date(T0 + 2000).toISOString(), receiptAttachmentId: "att_1", receiptAt: new Date(T0 + 2500).toISOString(), fundedAt: new Date(T0 + 4000).toISOString(), deliveredAt: new Date(T0 + 5000).toISOString(), delivery: { text: "Готово", link: "https://example.com/r" } }],
    };
    const timeline = dealTimeline({
      deal,
      proofs: [{ stageId: base.stages[0].id, txHash: "abc", at: T0 + 3000, explorerUrl: "https://tronscan.org/#/transaction/abc" }],
      complaints: [{ id: "c1", side: "customer", reason: "quality", createdAt: T0 + 6000, closedAt: null }],
      snapshotMask: "USDT •••a1b2",
      receiptUrls: { [base.stages[0].id]: "/api/admin/disputes/d1/attachments/att_1" },
    });
    expect(timeline.events.map((event) => event.label.split(" (")[0])).toEqual([
      "Умови виставив замовник",
      "Умови прийнято",
      "Замовник позначив оплату",
      "Замовник додав чек",
      "Транзакцію USDT знайдено в мережі",
      "Оплату підтверджено",
      "Виконавець здав етап",
      "Скарга: замовник",
    ]);
    expect(timeline.events[2].detail).toContain("USDT");
    expect(timeline.events[3].href).toBe("/api/admin/disputes/d1/attachments/att_1");
    expect(timeline.events[4]).toMatchObject({ detail: "abc", href: "https://tronscan.org/#/transaction/abc", external: true });
    expect(timeline.events[6]).toMatchObject({ detail: "Готово", href: "https://example.com/r", external: true });
    expect(timeline.notes).toEqual([
      { label: "Що вважаємо готовим", value: "Лендинг" },
      { label: "Реквізити виконавця на момент прийняття (маска)", value: "USDT •••a1b2" },
    ]);
  });
});

describe("поради у спорі", () => {
  it("не обіцяють того, чого немає: ні повернення, ні рішення на користь", () => {
    const text = DISPUTE_TIPS.join(" ").toLowerCase();
    expect(text).not.toMatch(/поверн|гарант|захист|обов'язково вирішим/);
  });
});

describe("підписи етапу «виплачено»", () => {
  it("пряма угода: роботу прийнято, виплат платформа не робила; безпечна: виплачено", () => {
    expect(stageState("direct", "released")).toBe("Роботу прийнято");
    expect(stageState("safe", "released")).toBe("Виплачено");
    expect(stageState("direct", "delivered")).toBe("Здано, чекає підтвердження");
  });

  it("у хронології прямої угоди немає слова «виплачено»", () => {
    const base = createDeal("d1", draft(), T0);
    const at = new Date(T0 + 1000).toISOString();
    const timeline = (method: "direct" | "safe") => dealTimeline({ deal: { ...base, method, status: "completed", acceptedAt: at, stages: [{ ...base.stages[0], status: "released", releasedAt: at }] }, proofs: [], complaints: [], snapshotMask: null, receiptUrls: {} });
    expect(timeline("direct").events.map((event) => event.label)).toContain("Роботу прийнято");
    expect(timeline("safe").events.map((event) => event.label)).toContain("Етап виплачено");
  });
});
