// tests/helpers/money-harness.ts
//
// Общая обвязка тестов денег безопасной сделки: пользователи, платёж исполнителя, помощники «оплатить»,
// «принять», «вебхук банка» и шаги сделки до нужного состояния. Подмены vi.mock живут в самих тестах.

import { expect, vi } from "vitest";
import { POST as WEBHOOK } from "@/app/api/monobank/webhook/route";
import { POST as PAY } from "@/app/api/deals/[id]/pay/route";
import { POST as ACT } from "@/app/api/deals/[id]/route";
import { quoteStage } from "@/lib/deals/price";
import type { Deal } from "@/lib/deals/types";
import { authAttempts } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { actAsPerformer, getDealForOwner, proposeDeal } from "@/lib/server/deal-repo";
import { savePayoutAccount } from "@/lib/server/payment-repo";
import { sealText } from "@/lib/server/secret-box";
import { makeUser, useTestD1 as openTestD1 } from "./d1";
import { adminMail, bank, notifyLater, session } from "./money-mocks";

export const OWNER = { id: "dm-owner", email: "dm-owner@example.com" };
// Менше за поріг коду приймання (RELEASE_CODE_FROM): шлях з кодом перевіряє окремий тест.
export const PRICE = 9_000;
export const TOTAL = quoteStage(PRICE).total;
export const PERF_TAX_ID = "1234567890";
const KEY = Buffer.alloc(32, 9).toString("base64");
export const DAY = 86_400_000;

export const initMoneyDb = async () => {
  const ctx = await openTestD1();
  // Акаунти старші за тиждень: ліміт нового акаунта перевіряється окремим тестом.
  for (const id of ["dm-owner", "dm-perf", "dm-other", "dm-noaccount"]) await makeUser(ctx.db, id, { createdAt: Date.now() - 30 * DAY });
  process.env.REQUISITES_KEY = KEY;
  // ІПН виконавця зашифрований, як у справжній заявці; id отримувача сервер бере зі списку банку (fake-bank), а не з цього запису.
  await savePayoutAccount({ userId: "dm-perf", provider: "monobank", taxId: await sealText(PERF_TAX_ID, "dm-perf"), receiverId: null, status: "active" });
  return ctx;
};

const ENV = ["REQUISITES_KEY", "SAFE_DEAL_MODE", "MONOBANK_SPLIT_TOKEN", "MONOBANK_PLATFORM_RECEIVER_ID", "ADMIN_EMAILS"];

export const setupMoneyEnv = async () => {
  // Лічильники частоти спільні на всю базу тестового файлу: кожен тест починає з чистими.
  await getDb().delete(authAttempts);
  process.env.SAFE_DEAL_MODE = "on";
  process.env.MONOBANK_SPLIT_TOKEN = "split-token";
  process.env.MONOBANK_PLATFORM_RECEIVER_ID = "recv-platform";
  process.env.ADMIN_EMAILS = "boss@example.com";
  vi.stubGlobal("fetch", bank.fetchMock);
  bank.reset();
  bank.state.receivers = [{ id: "recv-perf", edrpou: PERF_TAX_ID, name: "ФОП Юлія" }];
  process.env.REQUISITES_KEY = KEY;
  notifyLater.mockReset();
  adminMail.mockReset();
  session.user = OWNER;
};

export const teardownMoneyEnv = () => {
  vi.unstubAllGlobals();
  for (const name of ENV) delete process.env[name];
};

let counter = 0;
export const newDeal = async (performerId = "me-dm-perf", amount = PRICE): Promise<Deal> => {
  counter += 1;
  const deal = await proposeDeal(
    OWNER.id,
    { requestId: "r-money", responseId: `resp-money-${counter}`, method: "safe", performer: { id: performerId, name: "Юлія", avatarIndex: 0, specialty: "", fop: true }, stages: [{ title: "Робота", amount, days: 5 }] },
    { safeEnabled: true },
  );
  if (typeof deal === "string") throw new Error(deal);
  await actAsPerformer(performerId.slice(3), deal.id, "accept", undefined);
  return deal;
};

export const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });
export const pay = (dealId: string) => PAY(new Request("https://findlyfy.test/api/deals/x/pay", { method: "POST", body: JSON.stringify({}) }), ctxFor(dealId));
export const act = (dealId: string, action: string) => ACT(new Request("https://findlyfy.test/api/deals/x", { method: "POST", body: JSON.stringify({ action }) }), ctxFor(dealId));
export const stageOf = async (dealId: string) => (await getDealForOwner(dealId, OWNER.id))!.stages[0];

/** Вебхук: тіло як у банку, підпис підмінено (його перевірка покрита monobank-webhook.test.ts). */
export const webhook = (invoiceId: string, overrides: Record<string, unknown> = {}) => {
  const invoice = bank.invoices.get(invoiceId)!;
  return WEBHOOK(new Request("https://findlyfy.test/api/monobank/webhook", { method: "POST", body: JSON.stringify({ ...invoice, ...overrides }), headers: { "x-sign": "sig" } }));
};

/** Оплата доведена до «холд підтверджено банком»: повертає угоду й id рахунку. */
export const funded = async (amount = PRICE): Promise<{ deal: Deal; invoiceId: string }> => {
  const deal = await newDeal("me-dm-perf", amount);
  const response = await pay(deal.id);
  expect(response.status).toBe(201);
  const invoiceId = [...bank.invoices.keys()].at(-1)!;
  bank.setStatus(invoiceId, "hold");
  expect((await webhook(invoiceId)).status).toBe(200);
  expect((await stageOf(deal.id)).status).toBe("funded");
  return { deal, invoiceId };
};

export const delivered = async (amount = PRICE) => {
  const state = await funded(amount);
  await actAsPerformer("dm-perf", state.deal.id, "deliver", undefined);
  return state;
};


/** Прохід sweep зачіпає всі угоди в базі, тож рахуємо лише виклики по рахунку цього тесту. */
export const callsFor = (path: string, invoiceId: string) => bank.calls.filter((call) => call.path === path && (call.body as { invoiceId?: string } | undefined)?.invoiceId === invoiceId).length;
