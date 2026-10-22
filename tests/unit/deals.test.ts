import { describe, expect, it } from "vitest";
import { applyAction, applyModeratorAction, applyPerformerAction, performerNeeds, createDeal, currentStage, dealPhase, feeOf, needsAction, payoutOf, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import { quoteStage, splitShares, totalRange } from "@/lib/deals/price";
import { ACQUIRING_RATE, HOLD_DAYS, MAX_STAGE_AMOUNT, MAX_STAGE_DAYS, type Deal, type DealDraft } from "@/lib/deals/types";

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

const act = (deal: Deal, action: Parameters<typeof applyPerformerAction>[1], at: number): Deal => applyPerformerAction(deal, action, undefined, at) as Deal;
const accepted = (d = draft()): Deal => act(createDeal("deal-abcd", d, T0), "accept", T0 + 3000);

describe("правила угоди", () => {
  it("комісія лише в безпечній угоді, 5%", () => {
    expect(feeOf(10000, "safe")).toBe(500);
    expect(feeOf(10000, "direct")).toBe(0);
    // Виконавець отримує ціну повністю: комісії лягають на замовника.
    expect(payoutOf(10000)).toBe(10000);
  });

  it("безпечна угода — лише ФОП, етап не довший за холд мінус запас, не більший за ліміт, прямий — одним платежем", () => {
    expect(validateDraft(draft())).toBeNull();
    expect(validateDraft(draft({ performer: { ...performer, fop: false } }))).toMatch(/ФОП/);
    expect(validateDraft(draft({ stages: [{ title: "Все", amount: 10000, days: MAX_STAGE_DAYS + 1 }] }))).toMatch(/розділіть/);
    expect(validateDraft(draft({ stages: [{ title: "Все", amount: 10000, days: MAX_STAGE_DAYS }] }))).toBeNull();
    expect(validateDraft(draft({ stages: [{ title: "Все", amount: MAX_STAGE_AMOUNT + 1, days: 5 }] }))).toMatch(/розділіть/);
    expect(validateDraft(draft({ stages: [{ title: "Все", amount: MAX_STAGE_AMOUNT, days: 5 }] }))).toBeNull();
    // Прямий переказ повз банк-еквайр: ліміту етапу немає.
    expect(validateDraft(draft({ method: "direct", stages: [{ title: "Все", amount: 500_000, days: 5 }] }))).toBeNull();
    expect(validateDraft(draft({ method: "direct", stages: [{ title: "А", amount: 500, days: 3 }, { title: "Б", amount: 500, days: 3 }] }))).toMatch(/одним платежем/);
    expect(validateDraft(draft({ method: "direct", performer: { ...performer, fop: false }, stages: [{ title: "Все", amount: 5000, days: 40 }] }))).toBeNull();
    expect(validateDraft(draft({ stages: [{ title: "", amount: 500, days: 3 }] }))).toMatch(/Назвіть/);
    expect(validateDraft(draft({ stages: [{ title: "А", amount: 50, days: 3 }] }))).toMatch(/Сума угоди/);
  });

  it("довгу роботу ділить на етапи, що вкладаються в холд, без втрати копійки", () => {
    const stages = splitIntoStages(10001, 60);
    expect(stages).toHaveLength(3);
    expect(stages.reduce((sum, stage) => sum + stage.amount, 0)).toBe(10001);
    expect(stages.reduce((sum, stage) => sum + stage.days, 0)).toBe(60);
    expect(stages.every((stage) => stage.days <= MAX_STAGE_DAYS)).toBe(true);
    expect(splitIntoStages(5000, 5)).toEqual([{ title: "Робота", amount: 5000, days: 5 }]);
    // Великий бюджет ділиться ще й за лімітом етапу, навіть коли термін короткий.
    const big = splitIntoStages(250_000, 10);
    expect(big).toHaveLength(3);
    expect(big.every((stage) => stage.amount <= MAX_STAGE_AMOUNT)).toBe(true);
    expect(big.reduce((sum, stage) => sum + stage.amount, 0)).toBe(250_000);
  });
});

describe("шлях безпечної угоди", () => {
  it("поки виконавець не відповів, угода лише запропонована", () => {
    const deal = createDeal("deal-abcd", draft(), T0);
    expect(deal.status).toBe("proposed");
    expect(act(deal, "accept", T0 + 3000).status).toBe("accepted");
  });

  it("заморожування → здано → виплата → угода завершена; холд на HOLD_DAYS днів, розбивка оплати збережена", () => {
    let deal = accepted();
    expect(needsAction(deal)).toBe("fund");
    deal = applyAction(deal, "fund", undefined, T0 + 5000, { card: "ua" }) as Deal;
    const stage = currentStage(deal)!;
    expect(stage.status).toBe("funded");
    expect(Date.parse(stage.holdUntil!) - Date.parse(stage.fundedAt!)).toBe(HOLD_DAYS * 86_400_000);
    expect(stage.payment).toMatchObject({ card: "ua", price: 1_000_000, fee: 50_000, total: 1_063_830 });
    expect(needsAction(deal)).toBeNull();
    deal = act(deal, "deliver", T0 + 15_000);
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
    deal = act(deal, "deliver", T0 + 14_000);
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
    expect(applyPerformerAction(deal, "deliver", undefined, T0 + 6000)).toMatch(/оплату підтверджено/);
    deal = act(deal, "confirm_paid", T0 + 9000);
    expect(currentStage(deal)!.status).toBe("funded");
    deal = act(deal, "deliver", T0 + 19_000);
    expect(needsAction(deal)).toBe("confirm");
    deal = applyAction(deal, "release", undefined, T0 + 60_000) as Deal;
    expect(deal.status).toBe("completed");
  });

  it("гарантії платформи немає: спір не відкривається, заморожування недоступне", () => {
    let deal = direct();
    expect(applyAction(deal, "fund", undefined, T0)).toMatch(/Заморозити/);
    deal = applyAction(deal, "claim_paid", undefined, T0 + 5000) as Deal;
    deal = act(deal, "confirm_paid", T0 + 9000);
    expect(applyAction(deal, "dispute", undefined, T0 + 20_000)).toMatch(/прямому переказі/);
  });
});

describe("угода з виконавцем-акаунтом", () => {
  const real: DealDraft = { requestId: "r", responseId: "x", method: "direct", performer: { id: "me-u1", name: "Іван", avatarIndex: 0, specialty: "Розробник", fop: false }, stages: [{ title: "Робота", amount: 5000, days: 7 }] };
  const NOW = 10_000_000;

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

describe("умови з розмови: виставляє виконавець", () => {
  const performerProposed = (): Deal => ({ ...createDeal("deal_dir1", { ...draft(), proposedBy: "performer", title: "Лендинг" }, 0), proposedBy: "performer" });

  it("замовник приймає й відхиляє, виконавець чекає й може відкликати", () => {
    const deal = performerProposed();
    expect(needsAction(deal)).toBe("answer");
    expect(performerNeeds(deal)).toBeNull();
    const accepted = applyAction(deal, "accept", undefined, 1) as Deal;
    expect(accepted.status).toBe("accepted");
    expect((applyAction(deal, "decline", undefined, 1) as Deal).status).toBe("declined");
    expect((applyPerformerAction(deal, "withdraw", undefined, 1) as Deal).status).toBe("cancelled");
  });

  it("свої умови сам не приймаєш: виконавець не відповідає на власну пропозицію, замовник не скасовує чужу", () => {
    const deal = performerProposed();
    expect(applyPerformerAction(deal, "accept", undefined, 1)).toMatch(/відповідає замовник/);
    expect(applyAction(deal, "cancel", undefined, 1)).toMatch(/відхилити/);
  });

  it("для звичайної угоди від замовника відкликання й прийняття замовником недоступні", () => {
    const deal = createDeal("deal_cust", draft(), 0);
    expect(applyPerformerAction(deal, "withdraw", undefined, 1)).toMatch(/свою пропозицію/);
    expect(applyAction(deal, "accept", undefined, 1)).toMatch(/приймає виконавець/);
    expect(performerNeeds(deal)).toBe("answer");
  });
});

describe("рішення модератора у спорі", () => {
  const disputed = (stages = [{ title: "Робота", amount: 10000, days: 7 }]): Deal => {
    let deal = accepted(draft({ stages }));
    deal = applyAction(deal, "fund", undefined, T0 + 4000) as Deal;
    deal = act(deal, "deliver", T0 + 5000);
    return applyAction(deal, "dispute", undefined, T0 + 6000) as Deal;
  };

  it("спір запам'ятовує, коли відкрито", () => {
    expect(disputed().stages[0].disputedAt).toBe(new Date(T0 + 6000).toISOString());
  });

  it("виплата: етап виплачено, остання угода завершується", () => {
    const done = applyModeratorAction(disputed(), "release", undefined, T0 + 9000) as Deal;
    expect(done.stages[0]).toMatchObject({ status: "released", releasedAt: new Date(T0 + 9000).toISOString() });
    expect(done.status).toBe("completed");
    expect(done.disputed).toBe(false);
  });

  it("виплата середнього етапу пускає угоду далі", () => {
    const deal = disputed([{ title: "А", amount: 5000, days: 5 }, { title: "Б", amount: 5000, days: 5 }]);
    const done = applyModeratorAction(deal, "release", undefined, T0 + 9000) as Deal;
    expect(done.status).toBe("accepted");
    expect(currentStage(done)!.id).toBe(deal.stages[1].id);
    expect(needsAction(done)).toBe("fund");
  });

  it("повернення замовнику: етап «повернено», угода закрита, спору немає", () => {
    const done = applyModeratorAction(disputed(), "refund", undefined, T0 + 9000) as Deal;
    expect(done.stages[0]).toMatchObject({ status: "refunded", refundedAt: new Date(T0 + 9000).toISOString() });
    expect(done.status).toBe("cancelled");
    expect(done.disputed).toBe(false);
    expect(needsAction(done)).toBeNull();
  });

  it("доопрацювання: етап знову в роботі, здачі нема, холд той самий", () => {
    const deal = disputed();
    const done = applyModeratorAction(deal, "rework", undefined, T0 + 9000) as Deal;
    expect(done.stages[0].status).toBe("funded");
    expect(done.stages[0].deliveredAt).toBeUndefined();
    expect(done.stages[0].holdUntil).toBe(deal.stages[0].holdUntil);
    expect(done.stages[0].reworkAt).toBe(new Date(T0 + 9000).toISOString());
    expect(done.disputed).toBe(false);
    expect(performerNeeds(done)).toBe("deliver");
    // Після доопрацювання виконавець здає знову, і спір можна відкрити вдруге.
    const again = applyAction(act(done, "deliver", T0 + 10_000), "dispute", undefined, T0 + 11_000) as Deal;
    expect(again.disputed).toBe(true);
  });

  it("доопрацювання неможливе, коли холд збіг", () => {
    const deal = disputed();
    const late = Date.parse(deal.stages[0].holdUntil!) + 1000;
    expect(applyModeratorAction(deal, "rework", undefined, late)).toMatch(/Холд уже збіг/);
    expect(applyModeratorAction(deal, "release", undefined, late)).not.toBeTypeOf("string");
  });

  it("працює лише з етапом у спорі", () => {
    const funded = applyAction(accepted(), "fund", undefined, T0 + 4000) as Deal;
    expect(applyModeratorAction(funded, "release", undefined, T0 + 5000)).toMatch(/не в спорі/);
    expect(applyModeratorAction(disputed(), "release", "nope", T0 + 5000)).toMatch(/не в спорі/);
    const done = applyModeratorAction(disputed(), "release", undefined, T0 + 9000) as Deal;
    expect(applyModeratorAction(done, "refund", undefined, T0 + 9500)).toMatch(/не в спорі/);
  });
});

describe("до оплати: ціна виконавця + комісія платформи + комісія банку", () => {
  it("українська картка: 10 000 ₴ → 10 638,30 ₴, виконавцю рівно 10 000", () => {
    const quote = quoteStage(10_000, "ua");
    expect(quote).toEqual({ card: "ua", price: 1_000_000, fee: 50_000, bankFee: 13_830, total: 1_063_830 });
    expect(quote.price + quote.fee + quote.bankFee).toBe(quote.total);
  });

  it("закордонна картка дорожча: 10 000 ₴ → 10 714,29 ₴", () => {
    expect(quoteStage(10_000, "foreign")).toMatchObject({ bankFee: 21_429, total: 1_071_429 });
  });

  it("комісії банку вистачає на ставку: після її утримання виконавцю лишається ціна", () => {
    for (const card of ["ua", "foreign"] as const) {
      for (const price of [100, 333, 1999.5, 10_000, 99_999, 100_000]) {
        const quote = quoteStage(price, card);
        const bankTakes = Math.round(quote.total * ACQUIRING_RATE[card]);
        const { performer, platform } = splitShares(quote);
        expect(performer + platform).toBe(quote.total);
        // Банк утримує свою комісію з частки виконавця (до копійки округлення).
        expect(performer - bankTakes).toBeGreaterThanOrEqual(quote.price - 1);
      }
    }
  });

  it("діапазон для кількох етапів і ціна без копійок до копійки", () => {
    const range = totalRange([10_000, 5_000]);
    expect(range.ua).toBe(quoteStage(10_000, "ua").total + quoteStage(5_000, "ua").total);
    expect(range.foreign).toBeGreaterThan(range.ua);
  });

  it("без типу картки рахуємо за вищою ставкою, щоб виконавець не лишився внакладі", () => {
    const deal = accepted();
    const funded = applyAction(deal, "fund", undefined, T0 + 5000) as Deal;
    expect(currentStage(funded)!.payment?.card).toBe("foreign");
  });
});
