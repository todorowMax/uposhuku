import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBasket } from "@/lib/deals/basket";
import { quoteStage } from "@/lib/deals/price";
import type { DealDraft } from "@/lib/deals/types";
import { proposeDeal } from "@/lib/server/deal-repo";
import { activeStagePayment, createDealPayment, findPaymentByInvoice, forgetPaymentEvent, getPayoutAccount, recordPaymentEvent, savePayoutAccount, updatePayment } from "@/lib/server/payment-repo";
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
  const deal = (await proposeDeal("owner-pay", draft, 1_000)) as { id: string; stages: { id: string }[] };
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
    const created = await createDealPayment(input("inv-1"), 2_000);
    expect(created).toMatchObject({ status: "created", finalAmount: null, card: "ua", amount: 1_063_830 });
    const found = await findPaymentByInvoice("monobank", "inv-1");
    expect(found?.basket).toEqual(basket);
    expect(found?.basket).toHaveLength(40);
    expect(await findPaymentByInvoice("monobank", "unknown")).toBeNull();
    expect(await findPaymentByInvoice("uapay", "inv-1")).toBeNull();
  });

  it("один рахунок провайдера записується лише раз", async () => {
    await createDealPayment(input("inv-dup"), 2_100);
    await expect(createDealPayment(input("inv-dup"), 2_200)).rejects.toThrow();
  });

  it("статус і фінальна сума оновлюються, невдалі платежі не вважаємо активними", async () => {
    const first = await createDealPayment(input("inv-2"), 3_000);
    await updatePayment({ id: first.id, status: "hold" }, 3_100);
    expect((await findPaymentByInvoice("monobank", "inv-2"))?.status).toBe("hold");
    expect((await activeStagePayment(dealId, stageId))?.invoiceId).toBe("inv-2");

    await updatePayment({ id: first.id, status: "success", finalAmount: 637_000 }, 3_200);
    expect(await findPaymentByInvoice("monobank", "inv-2")).toMatchObject({ status: "success", finalAmount: 637_000 });

    const second = await createDealPayment(input("inv-3"), 4_000);
    expect((await activeStagePayment(dealId, stageId))?.id).toBe(second.id);
    await updatePayment({ id: second.id, status: "failure" }, 4_100);
    // Найновіший невдалий випадає, лишається попередній живий.
    expect((await activeStagePayment(dealId, stageId))?.invoiceId).toBe("inv-2");
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
