import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBasket } from "@/lib/deals/basket";
import { quoteStage } from "@/lib/deals/price";
import type { DealDraft } from "@/lib/deals/types";
import { proposeDeal } from "@/lib/server/deal-repo";
import { abandonReservation, acceptBankSnapshot, activeStagePayment, adoptInvoice, attachInvoice, createDealPayment, findPaymentByReference, findPaymentByInvoice, forgetPaymentEvent, getPayoutAccount, recordPaymentEvent, reserveDealPayment, savePayoutAccount, updatePayment } from "@/lib/server/payment-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let dealId = "";
let stageId = "";

const draft: DealDraft = {
  requestId: "req_pay",
  responseId: "resp_pay",
  method: "safe",
  performer: { id: "kyiv-1", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true },
  stages: [{ title: "Робота", amount: 10_000, days: 7 }],
};

beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "owner-pay");
  await makeUser(ctx.db, "perf-pay");
  const deal = (await proposeDeal("owner-pay", draft, { safeEnabled: true, now: 1_000 })) as { id: string; stages: { id: string }[] };
  dealId = deal.id;
  stageId = deal.stages[0].id;
});
afterAll(async () => {
  await ctx.close();
});

const basket = buildBasket(quoteStage(10_000, "ua"), { performer: "recv-p", platform: "recv-f" });
const input = (invoiceId: string) => ({ dealId, stageId, provider: "monobank" as const, invoiceId, card: "ua" as const, amount: 1_063_830, pageUrl: `https://pay.monobank.ua/${invoiceId}`, basket });

describe("платежі етапів на D1", () => {
  it("зберігає рахунок із корзиною й знаходить за id рахунку", async () => {
    const created = await createDealPayment({ ...input("inv-1"), stageId: "stage-first" }, 2_000);
    expect(created).toMatchObject({ status: "created", finalAmount: null, card: "ua", amount: 1_063_830 });
    const found = await findPaymentByInvoice("monobank", "inv-1");
    expect(found?.basket).toEqual(basket);
    expect(found?.basket).toHaveLength(40);
    expect(await findPaymentByInvoice("monobank", "unknown")).toBeNull();
    expect(await findPaymentByInvoice("uapay", "inv-1")).toBeNull();
  });

  it("один рахунок провайдера записується лише раз", async () => {
    await createDealPayment({ ...input("inv-dup"), stageId: "other-stage-1" }, 2_100);
    await expect(createDealPayment({ ...input("inv-dup"), stageId: "other-stage-2" }, 2_200)).rejects.toThrow();
  });

  it("на етап не більше одного живого платежу; невдалий звільняє етап, успішний ні", async () => {
    const first = await createDealPayment(input("inv-2"), 3_000);
    await updatePayment({ id: first.id, status: "hold" }, 3_100);
    expect((await findPaymentByInvoice("monobank", "inv-2"))?.status).toBe("hold");
    expect((await activeStagePayment(dealId, stageId))?.invoiceId).toBe("inv-2");
    // Другий живий платіж на той самий етап впирається в частковий унікальний індекс.
    await expect(createDealPayment(input("inv-3"), 3_150)).rejects.toThrow();

    await updatePayment({ id: first.id, status: "success", finalAmount: 637_000 }, 3_200);
    expect(await findPaymentByInvoice("monobank", "inv-2")).toMatchObject({ status: "success", finalAmount: 637_000 });
    await expect(createDealPayment(input("inv-3"), 3_250)).rejects.toThrow();

    await updatePayment({ id: first.id, status: "failure" }, 3_300);
    const second = await createDealPayment(input("inv-3"), 4_000);
    expect((await activeStagePayment(dealId, stageId))?.id).toBe(second.id);
    await updatePayment({ id: second.id, status: "expired" }, 4_100);
    expect(await activeStagePayment(dealId, stageId)).toBeNull();
  });

  it("резерв платежу: другий одночасний отримує null, рахунок прикріплюється, відмова звільняє етап", async () => {
    const free = { dealId, stageId: "stage-reserve", provider: "monobank" as const, card: "ua" as const, amount: 1_063_830, basket };
    const [a, b] = await Promise.all([reserveDealPayment(free, 7_000), reserveDealPayment(free, 7_000)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const reserved = (a ?? b)!;
    expect(reserved.status).toBe("creating");
    expect(reserved.invoiceId.startsWith("pending:")).toBe(true);
    expect((await findPaymentByReference(reserved.id))?.id).toBe(reserved.id);
    await attachInvoice(reserved.id, { invoiceId: "inv-res", pageUrl: "https://pay.monobank.ua/inv-res" }, 7_100);
    expect(await findPaymentByInvoice("monobank", "inv-res")).toMatchObject({ status: "created", pageUrl: "https://pay.monobank.ua/inv-res" });
    // Рахунок уже записано: запасний пошук за reference більше його не віддає.
    expect(await findPaymentByReference(reserved.id)).toBeNull();
    expect(await reserveDealPayment(free, 7_200)).toBeNull();

    const other = { ...free, stageId: "stage-reserve-2" };
    const lost = (await reserveDealPayment(other, 7_300))!;
    await abandonReservation(lost.id, 7_400);
    expect(await reserveDealPayment(other, 7_500)).not.toBeNull();
  });

  it("загублена відповідь банку: вебхук знаходить платіж за reference і вписує id рахунку", async () => {
    const lost = (await reserveDealPayment({ dealId, stageId: "stage-orphan", provider: "monobank", card: "ua", amount: 1_063_830, basket }, 7_600))!;
    await abandonReservation(lost.id, 7_700);
    await adoptInvoice(lost.id, "inv-orphan", 7_800);
    expect(await findPaymentByInvoice("monobank", "inv-orphan")).toMatchObject({ id: lost.id, status: "created" });
  });

  it("знімок банку приймається лише новіший; рівний за часом з іншим статусом теж, старіший ні", async () => {
    const payment = await createDealPayment({ ...input("inv-snap"), stageId: "stage-snap" }, 8_000);
    expect(await acceptBankSnapshot(payment.id, { status: "hold", modifiedDate: "2026-11-05T10:00:10Z" }, 8_100)).toBe(true);
    expect(await acceptBankSnapshot(payment.id, { status: "created", modifiedDate: "2026-11-05T10:00:05Z" }, 8_200)).toBe(false);
    expect(await acceptBankSnapshot(payment.id, { status: "hold", modifiedDate: "2026-11-05T10:00:10Z" }, 8_250)).toBe(false);
    expect((await findPaymentByInvoice("monobank", "inv-snap"))?.status).toBe("hold");
    expect(await acceptBankSnapshot(payment.id, { status: "success", modifiedDate: "2026-11-05T10:00:10Z", finalAmount: 5 }, 8_300)).toBe(true);
    expect(await findPaymentByInvoice("monobank", "inv-snap")).toMatchObject({ status: "success", finalAmount: 5 });
  });

  it("подію вебхука обробляємо один раз, а після нашої помилки дозволяємо повтор", async () => {
    expect(await recordPaymentEvent("monobank", "monobank:inv-1:2026-10-26T21:21:18Z", 5_000)).toBe(true);
    expect(await recordPaymentEvent("monobank", "monobank:inv-1:2026-10-26T21:21:18Z", 5_100)).toBe(false);
    await forgetPaymentEvent("monobank:inv-1:2026-10-26T21:21:18Z");
    expect(await recordPaymentEvent("monobank", "monobank:inv-1:2026-10-26T21:21:18Z", 5_200)).toBe(true);
  });

  it("рахунок виконавця: створюється, оновлюється, не дублюється на провайдера", async () => {
    expect(await getPayoutAccount("perf-pay", "monobank")).toBeNull();
    await savePayoutAccount({ userId: "perf-pay", provider: "monobank", taxId: "1234567890", receiverId: null, status: "pending" }, 6_000);
    expect(await getPayoutAccount("perf-pay", "monobank")).toMatchObject({ taxId: "1234567890", receiverId: null, status: "pending" });
    await savePayoutAccount({ userId: "perf-pay", provider: "monobank", taxId: "1234567890", receiverId: "recv-1", status: "active" }, 6_100);
    expect(await getPayoutAccount("perf-pay", "monobank")).toMatchObject({ receiverId: "recv-1", status: "active" });
    // Інший провайдер того ж користувача окремий запис.
    expect(await getPayoutAccount("perf-pay", "uapay")).toBeNull();
    await savePayoutAccount({ userId: "perf-pay", provider: "uapay", taxId: null, receiverId: "card-1", status: "active" }, 6_200);
    expect(await getPayoutAccount("perf-pay", "uapay")).toMatchObject({ receiverId: "card-1" });
    expect(await getPayoutAccount("perf-pay", "monobank")).toMatchObject({ receiverId: "recv-1" });
  });
});
