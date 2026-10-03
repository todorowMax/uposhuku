import { describe, expect, it } from "vitest";
import { SIM, applyAction, applyPerformerAction, performerNeeds, createDeal, currentStage, dealPhase, feeOf, needsAction, payoutOf, simulate, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import type { Deal, DealDraft } from "@/lib/deals/types";

const T0 = Date.parse("2026-10-03T10:00:00Z");
const performer = { id: "p1", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true };
const draft = (over: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "r1",
  responseId: "resp1",
  performer,
  method: "safe",
  stages: [{ title: "Робота", amount: 10000, days: 7 }],
  ...over,
});

const accepted = (d = draft()): Deal => simulate(createDeal("deal-abcd", d, T0), T0 + SIM.accept);

describe("правила угоди", () => {
  it("комісія лише в безпечній угоді, 5%", () => {
    expect(feeOf(10000, "safe")).toBe(500);
    expect(payoutOf(10000, "safe")).toBe(9500);
    expect(feeOf(10000, "direct")).toBe(0);
    expect(payoutOf(10000, "direct")).toBe(10000);
  });

  it("безпечна угода — лише ФОП, етап не довший за холд 9 днів, прямий — одним платежем", () => {
    expect(validateDraft(draft())).toBeNull();
    expect(validateDraft(draft({ performer: { ...performer, fop: false } }))).toMatch(/ФОП/);
    expect(validateDraft(draft({ stages: [{ title: "Все", amount: 10000, days: 20 }] }))).toMatch(/розділіть/);
    expect(validateDraft(draft({ method: "direct", stages: [{ title: "А", amount: 500, days: 3 }, { title: "Б", amount: 500, days: 3 }] }))).toMatch(/одним платежем/);
    expect(validateDraft(draft({ method: "direct", performer: { ...performer, fop: false }, stages: [{ title: "Все", amount: 5000, days: 40 }] }))).toBeNull();
    expect(validateDraft(draft({ stages: [{ title: "", amount: 500, days: 3 }] }))).toMatch(/Назвіть/);
    expect(validateDraft(draft({ stages: [{ title: "А", amount: 50, days: 3 }] }))).toMatch(/Сума угоди/);
  });

  it("довгу роботу ділить на етапи, що вкладаються в холд, без втрати копійки", () => {
    const stages = splitIntoStages(10001, 20);
    expect(stages).toHaveLength(3);
    expect(stages.reduce((sum, stage) => sum + stage.amount, 0)).toBe(10001);
    expect(stages.reduce((sum, stage) => sum + stage.days, 0)).toBe(20);
    expect(stages.every((stage) => stage.days <= 9)).toBe(true);
    expect(splitIntoStages(5000, 5)).toEqual([{ title: "Робота", amount: 5000, days: 5 }]);
  });
});

describe("шлях безпечної угоди", () => {
  it("виконавець погоджується за таймером, не раніше", () => {
    const deal = createDeal("deal-abcd", draft(), T0);
    expect(simulate(deal, T0 + SIM.accept - 1).status).toBe("proposed");
    expect(simulate(deal, T0 + SIM.accept).status).toBe("accepted");
  });

  it("заморожування → здано → виплата → угода завершена; холд на 9 днів", () => {
    let deal = accepted();
    expect(needsAction(deal)).toBe("fund");
    deal = applyAction(deal, "fund", undefined, T0 + 5000) as Deal;
    const stage = currentStage(deal)!;
    expect(stage.status).toBe("funded");
    expect(Date.parse(stage.holdUntil!) - Date.parse(stage.fundedAt!)).toBe(9 * 86_400_000);
    expect(needsAction(deal)).toBeNull();
    deal = simulate(deal, T0 + 5000 + SIM.deliver);
    expect(currentStage(deal)!.status).toBe("delivered");
    expect(needsAction(deal)).toBe("confirm");
    deal = applyAction(deal, "release", undefined, T0 + 20_000) as Deal;
    expect(deal.status).toBe("completed");
    expect(dealPhase([deal])).toBe("done");
  });

  it("етапи йдуть по черзі, наступний не починається без попереднього", () => {
    let deal = accepted(draft({ stages: [{ title: "А", amount: 5000, days: 5 }, { title: "Б", amount: 5000, days: 5 }] }));
    expect(applyAction(deal, "fund", deal.stages[1].id, T0)).toMatch(/попередній/);
    deal = applyAction(deal, "fund", deal.stages[0].id, T0 + 4000) as Deal;
    deal = simulate(deal, T0 + 4000 + SIM.deliver);
    deal = applyAction(deal, "release", deal.stages[0].id, T0 + 20_000) as Deal;
    expect(deal.status).toBe("accepted");
    expect(currentStage(deal)!.id).toBe(deal.stages[1].id);
    expect(needsAction(deal)).toBe("fund");
  });

  it("спір блокує виплату, відкрити його можна лише в безпечній угоді", () => {
    let deal = accepted();
    deal = applyAction(deal, "fund", undefined, T0 + 4000) as Deal;
    deal = applyAction(deal, "dispute", undefined, T0 + 5000) as Deal;
    expect(deal.disputed).toBe(true);
    expect(needsAction(deal)).toBe("dispute");
    expect(applyAction(deal, "release", undefined, T0 + 6000)).toMatch(/не здав/);
  });

  it("не можна платити до згоди виконавця й скасувати прийняту", () => {
    const proposed = createDeal("deal-abcd", draft(), T0);
    expect(applyAction(proposed, "fund", undefined, T0)).toMatch(/погодитися/);
    expect((applyAction(proposed, "cancel", undefined, T0) as Deal).status).toBe("cancelled");
    expect(applyAction(accepted(), "cancel", undefined, T0)).toMatch(/ще не прийняту/);
  });
});

describe("шлях прямого переказу за QR", () => {
  const direct = () => accepted(draft({ method: "direct", performer: { ...performer, fop: false }, stages: [{ title: "Робота", amount: 8000, days: 30 }] }));

  it("«я оплатив» → виконавець підтверджує → здає → замовник приймає", () => {
    let deal = direct();
    expect(needsAction(deal)).toBe("pay");
    deal = applyAction(deal, "claim_paid", undefined, T0 + 5000) as Deal;
    expect(currentStage(deal)!.status).toBe("claimed");
    expect(simulate(deal, T0 + 5000 + SIM.confirmPayment - 1).stages[0].status).toBe("claimed");
    deal = simulate(deal, T0 + 5000 + SIM.confirmPayment);
    expect(currentStage(deal)!.status).toBe("funded");
    deal = simulate(deal, T0 + 5000 + SIM.confirmPayment + SIM.deliver);
    expect(needsAction(deal)).toBe("confirm");
    deal = applyAction(deal, "release", undefined, T0 + 60_000) as Deal;
    expect(deal.status).toBe("completed");
  });

  it("гарантії платформи немає: спір не відкривається, заморожування недоступне", () => {
    let deal = direct();
    expect(applyAction(deal, "fund", undefined, T0)).toMatch(/Заморозити/);
    deal = applyAction(deal, "claim_paid", undefined, T0 + 5000) as Deal;
    deal = simulate(deal, T0 + 5000 + SIM.confirmPayment);
    expect(applyAction(deal, "dispute", undefined, T0 + 20_000)).toMatch(/прямому переказі/);
  });
});

describe("угода з виконавцем-акаунтом", () => {
  const real: DealDraft = { requestId: "r", responseId: "x", method: "direct", performer: { id: "me-u1", name: "Іван", avatarIndex: 0, specialty: "Розробник", fop: false }, stages: [{ title: "Робота", amount: 5000, days: 7 }] };
  const NOW = 10_000_000;

  it("таймер за нього нічого не робить", () => {
    const deal = createDeal("d1", real, NOW);
    expect(simulate(deal, NOW + 100 * SIM.deliver)).toBe(deal);
  });

  it("виконавець приймає, замовник позначає оплату, виконавець підтверджує і здає, замовник приймає", () => {
    let deal = createDeal("d2", real, NOW);
    expect(performerNeeds(deal)).toBe("answer");
    deal = applyPerformerAction(deal, "accept", undefined, NOW + 1) as Deal;
    expect(deal.status).toBe("accepted");
    // До оплати здати нічого.
    expect(applyPerformerAction(deal, "deliver", undefined, NOW + 2)).toMatch(/оплату підтверджено/);
    deal = applyAction(deal, "claim_paid", undefined, NOW + 3) as Deal;
    expect(performerNeeds(deal)).toBe("confirm");
    deal = applyPerformerAction(deal, "confirm_paid", undefined, NOW + 4) as Deal;
    expect(performerNeeds(deal)).toBe("deliver");
    deal = applyPerformerAction(deal, "deliver", undefined, NOW + 5) as Deal;
    expect(deal.stages[0].status).toBe("delivered");
    expect(performerNeeds(deal)).toBeNull();
    deal = applyAction(deal, "release", undefined, NOW + 6) as Deal;
    expect(deal.status).toBe("completed");
  });

  it("відхилена пропозиція закривається, повторно відповісти не можна", () => {
    const deal = createDeal("d3", real, NOW);
    const declined = applyPerformerAction(deal, "decline", undefined, NOW + 1) as Deal;
    expect(declined.status).toBe("declined");
    expect(applyPerformerAction(declined, "accept", undefined, NOW + 2)).toMatch(/вже не чекає/);
  });

  it("не можна підтвердити оплату, якої замовник не позначав", () => {
    const deal = applyPerformerAction(createDeal("d4", real, NOW), "accept", undefined, NOW + 1) as Deal;
    expect(applyPerformerAction(deal, "confirm_paid", undefined, NOW + 2)).toMatch(/ще не позначив/);
  });
});
