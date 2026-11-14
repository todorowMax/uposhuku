import { describe, expect, it } from "vitest";
import { createDeal } from "@/lib/deals/machine";
import { needsMe, nextStepOf } from "@/lib/deals/next-step";
import type { Deal, DealMethod, DealStage } from "@/lib/deals/types";

const performer = { id: "p1", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true };

const make = (method: DealMethod, patch: Partial<Deal> = {}): Deal => ({
  ...createDeal("deal-abcd", { requestId: "r1", responseId: "resp1", performer, method, stages: [{ title: "Робота", amount: 1000, days: 5 }] }, 0),
  ...patch,
});

/** Прийнята угода, де єдиний етап у заданому стані. */
const at = (method: DealMethod, status: DealStage["status"]): Deal => {
  const deal = make(method, { status: "accepted" });
  return { ...deal, stages: deal.stages.map((stage) => ({ ...stage, status })) };
};

describe("nextStepOf: умови", () => {
  it("умови виконавця: замовник приймає, виконавець чекає", () => {
    const deal = make("direct", { proposedBy: "performer" });
    expect(nextStepOf(deal, "customer")).toEqual({ action: "accept", label: "Прийняти умови" });
    expect(nextStepOf(deal, "performer")).toBeNull();
  });

  it("умови замовника: виконавець приймає, замовник чекає", () => {
    const deal = make("safe", { proposedBy: "customer" });
    expect(nextStepOf(deal, "performer")).toEqual({ action: "accept", label: "Прийняти" });
    expect(nextStepOf(deal, "customer")).toBeNull();
  });

  it("угода з відгуку без proposedBy: пропонує замовник", () => {
    const deal = make("direct");
    expect(nextStepOf(deal, "performer")?.action).toBe("accept");
    expect(nextStepOf(deal, "customer")).toBeNull();
  });

  it("відхилена, скасована й завершена угоди кроку не мають", () => {
    for (const status of ["declined", "cancelled", "completed"] as const) {
      const deal = make("direct", { status });
      expect(nextStepOf(deal, "customer")).toBeNull();
      expect(nextStepOf(deal, "performer")).toBeNull();
    }
  });
});

describe("nextStepOf: замовник", () => {
  it("безпечна угода: оплатити, потім прийняти й виплатити", () => {
    expect(nextStepOf(at("safe", "pending"), "customer")).toEqual({ action: "pay", label: "Оплатити" });
    expect(nextStepOf(at("safe", "delivered"), "customer")).toEqual({ action: "release", label: "Підтвердити й виплатити" });
  });

  it("прямий переказ: «Оплатити» (відкриває реквізити), потім прийняти роботу", () => {
    expect(nextStepOf(at("direct", "pending"), "customer")).toEqual({ action: "claim", label: "Оплатити" });
    expect(nextStepOf(at("direct", "delivered"), "customer")).toEqual({ action: "release", label: "Прийняти роботу" });
  });

  it("ескроу: кроки відкривають екран угоди", () => {
    expect(nextStepOf(at("escrow", "pending"), "customer")).toEqual({ action: "open", label: "Внести кошти" });
    expect(nextStepOf(at("escrow", "delivered"), "customer")).toEqual({ action: "open", label: "Прийняти роботу" });
  });

  it.each(["safe", "direct", "escrow"] as const)("%s: у решті станів чекаємо інших", (method) => {
    for (const status of ["claimed", "funded", "releasing", "released", "disputed", "refunding", "refunded"] as const) {
      expect(nextStepOf(at(method, status), "customer")).toBeNull();
    }
  });
});

describe("nextStepOf: виконавець", () => {
  it("прямий переказ: підтвердити оплату, потім здати етап", () => {
    expect(nextStepOf(at("direct", "claimed"), "performer")).toEqual({ action: "confirm_paid", label: "Підтвердити оплату" });
    // Замовник ще нічого не позначив: виконавець усе одно бачить дію.
    expect(nextStepOf(at("direct", "pending"), "performer")).toEqual({ action: "confirm_paid", label: "Оплату отримано" });
    expect(nextStepOf(at("safe", "pending"), "performer")).toBeNull();
    expect(nextStepOf(at("escrow", "pending"), "performer")).toBeNull();
    expect(nextStepOf(at("direct", "funded"), "performer")).toEqual({ action: "deliver", label: "Здати етап" });
  });

  it("безпечна угода: після холду здає етап", () => {
    expect(nextStepOf(at("safe", "funded"), "performer")).toEqual({ action: "deliver", label: "Здати етап" });
  });

  it("ескроу: здача іде в блокчейні, тож крок відкриває екран", () => {
    expect(nextStepOf(at("escrow", "funded"), "performer")).toEqual({ action: "open", label: "Здати етап" });
  });

  it.each(["safe", "direct", "escrow"] as const)("%s: у решті станів чекаємо замовника або банк", (method) => {
    // Прямий переказ у pending виконавець підтверджує сам: це перевіряє тест вище.
    const statuses = method === "direct" ? (["delivered", "releasing", "released", "disputed", "refunding", "refunded"] as const) : (["pending", "delivered", "releasing", "released", "disputed", "refunding", "refunded"] as const);
    for (const status of statuses) {
      expect(nextStepOf(at(method, status), "performer")).toBeNull();
    }
  });
});

describe("needsMe", () => {
  it("збігається з тим, чого чекає угода від сторони", () => {
    expect(needsMe(at("safe", "pending"), "customer")).toBe(true);
    expect(needsMe(at("safe", "pending"), "performer")).toBe(false);
    expect(needsMe(at("direct", "claimed"), "performer")).toBe(true);
    expect(needsMe(at("safe", "funded"), "customer")).toBe(false);
    // Спір чекає на модератора, але для замовника це «потрібна увага»: крапка лишається, кроку немає.
    expect(needsMe(at("safe", "disputed"), "customer")).toBe(true);
    expect(nextStepOf(at("safe", "disputed"), "customer")).toBeNull();
  });
});
