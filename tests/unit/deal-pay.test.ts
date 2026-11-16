// Оплата етапу безпечної угоди (lib/server/deal-pay.ts, startStagePayment) напряму, без маршруту й без ліміту частоти:
// порядок відмов (режим, угода, етап, ліміт нового акаунта, отримувач, налаштування), що відбувається з уже існуючим
// платежем етапу, що йде в банк. Основні шляхи через POST /api/deals/:id/pay покрито в deal-money.test.ts і
// payout-flow.test.ts; тут гілки, яких маршрутні тести не торкаються.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", async () => ({ getSessionUser: async () => (await import("../helpers/money-mocks")).session.user }));
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: async () => true }));
vi.mock("@/lib/server/notify", async () => ({ notifyLater: (await import("../helpers/money-mocks")).notifyLater, notifyUser: vi.fn() }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendAdminNotice: (await import("../helpers/money-mocks")).adminMail }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import type { Deal, DealMethod } from "@/lib/deals/types";
import { NEW_ACCOUNT_DAYS, NEW_ACCOUNT_MAX_STAGE } from "@/lib/deals/limits";
import { startStagePayment, type PayResult } from "@/lib/server/deal-pay";
import { actAsPerformer, getDealForOwner, proposeDeal } from "@/lib/server/deal-repo";
import { getPayment } from "@/lib/server/payment-repo";
import { makeUser, type useTestD1 } from "../helpers/d1";
import { DAY, funded, initMoneyDb, OWNER, PRICE, setupMoneyEnv, stageOf, teardownMoneyEnv, TOTAL } from "../helpers/money-harness";
import { bank } from "../helpers/money-mocks";

const ORIGIN = "https://findlyfy.test";
const YOUNG = { id: "dp-young", email: "dp-young@example.com" };
const YOUNG_CREATED = Date.now() - 2 * DAY;

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await initMoneyDb();
  await makeUser(ctx.db, YOUNG.id, { email: YOUNG.email, createdAt: YOUNG_CREATED });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(setupMoneyEnv);
afterEach(() => {
  teardownMoneyEnv();
  delete process.env.SAFE_DEAL_USERS;
});

const start = (dealId: string, over: { user?: { id: string; email: string }; now?: number } = {}) => startStagePayment({ user: over.user ?? OWNER, dealId, origin: ORIGIN, now: over.now });
const refused = (result: PayResult) => {
  if (result.ok) throw new Error("очікували відмову");
  return result;
};
const invoicesCreated = () => bank.count("invoice/create");
const paymentRows = async (dealId: string) => (await ctx.db.prepare("select id, status, invoice_id from deal_payments where deal_id = ?").bind(dealId).all<{ id: string; status: string; invoice_id: string }>()).results;

let counter = 0;
/** Угода цього файлу: спосіб, власник, етап; приймає її виконавець (за потреби). */
const makeDeal = async (input: { method?: DealMethod; owner?: string; amount?: number; title?: string; accept?: boolean } = {}): Promise<Deal> => {
  const { method = "safe", owner = OWNER.id, amount = PRICE, title = "Робота", accept = true } = input;
  counter += 1;
  const deal = await proposeDeal(
    owner,
    { requestId: "r-pay", responseId: `resp-pay-${counter}`, method, performer: { id: "me-dm-perf", name: "Юлія", avatarIndex: 0, specialty: "", fop: true }, stages: [{ title, amount, days: 5 }] },
    { safeEnabled: true },
  );
  if (typeof deal === "string") throw new Error(deal);
  if (accept) await actAsPerformer("dm-perf", deal.id, "accept", undefined);
  return deal;
};

describe("startStagePayment: що йде в банк", () => {
  it("успіх: pageUrl, reused: false, холд на терміналі розщеплення, адреси з origin, reference резерву, назва призначення", async () => {
    const deal = await makeDeal({ title: "Логотип" });
    const result = await start(deal.id);
    expect(result).toEqual({ ok: true, pageUrl: expect.stringMatching(/^https:\/\/pay\.monobank\.ua\//), reused: false });
    const call = bank.last("invoice/create")!;
    expect(call.token).toBe("split-token");
    const body = call.body as { amount: number; paymentType: string; webHookUrl: string; redirectUrl: string; merchantPaymInfo: { reference: string; destination: string } };
    expect(body).toMatchObject({ amount: TOTAL, paymentType: "hold", webHookUrl: `${ORIGIN}/api/monobank/webhook`, redirectUrl: `${ORIGIN}/?open=inbox&paid=${deal.id}` });
    expect(body.merchantPaymInfo.destination).toBe(`Угода ${deal.number}: Логотип`);
    // reference це id резерву в нашій базі, за ним вебхук знаходить платіж.
    const [row] = await paymentRows(deal.id);
    expect(body.merchantPaymInfo.reference).toBe(row.id);
    expect(row.status).toBe("created");
    expect((await getPayment(row.id))?.invoiceId).toBe("inv-1");
  });

  it("довга назва етапу: призначення платежу обрізається до 120 символів", async () => {
    const deal = await makeDeal({ title: "А".repeat(150) });
    expect((await start(deal.id)).ok).toBe(true);
    const destination = (bank.last("invoice/create")!.body as { merchantPaymInfo: { destination: string } }).merchantPaymInfo.destination;
    expect(destination).toHaveLength(120);
    expect(destination.startsWith(`Угода ${deal.number}: `)).toBe(true);
  });
});

describe("startStagePayment: відмови до банку", () => {
  it("режим безпечної угоди: вимкнений чи не для цієї пошти: 409 «Безпечна угода ще недоступна»; для пошти зі списку проходить", async () => {
    const deal = await makeDeal();
    process.env.SAFE_DEAL_MODE = "off";
    expect(refused(await start(deal.id))).toMatchObject({ status: 409, title: "Безпечна угода ще недоступна" });
    process.env.SAFE_DEAL_MODE = "allowlist";
    process.env.SAFE_DEAL_USERS = "somebody@example.com";
    expect(refused(await start(deal.id))).toMatchObject({ status: 409, title: "Безпечна угода ще недоступна" });
    process.env.SAFE_DEAL_USERS = OWNER.email.toUpperCase();
    expect((await start(deal.id)).ok).toBe(true);
    delete process.env.SAFE_DEAL_USERS;
    expect(invoicesCreated()).toBe(1);
  });

  it("угоди немає чи вона чужа: 404, і чужий не дізнається, чи вона існує", async () => {
    const deal = await makeDeal();
    expect(refused(await start("deal-that-does-not-exist"))).toMatchObject({ status: 404, title: "Угоду не знайдено" });
    expect(refused(await start(deal.id, { user: { id: "dm-other", email: "dm-other@example.com" } }))).toMatchObject({ status: 404, title: "Угоду не знайдено" });
    expect(refused(await start(deal.id, { user: { id: "dm-perf", email: "dm-perf@example.com" } }))).toMatchObject({ status: 404 });
    expect(invoicesCreated()).toBe(0);
  });

  it("не безпечна угода (прямий переказ) чи ще не прийнята виконавцем: 409 «Оплата недоступна»", async () => {
    const direct = await makeDeal({ method: "direct" });
    expect(refused(await start(direct.id))).toMatchObject({ status: 409, title: "Оплата недоступна", detail: "Оплатити можна лише прийняту безпечну угоду." });
    const proposed = await makeDeal({ accept: false });
    expect(refused(await start(proposed.id))).toMatchObject({ status: 409, title: "Оплата недоступна" });
    expect(invoicesCreated()).toBe(0);
    expect(await paymentRows(direct.id)).toEqual([]);
    expect(await paymentRows(proposed.id)).toEqual([]);
  });

  it("етап уже не чекає оплати (холд підтверджено): 409 «Оплата недоступна», другий рахунок не створюється", async () => {
    const { deal } = await funded();
    const before = invoicesCreated();
    expect(refused(await start(deal.id))).toMatchObject({ status: 409, title: "Оплата недоступна", detail: "Цей етап зараз не чекає оплати." });
    expect(invoicesCreated()).toBe(before);
  });

  it("новий акаунт: ліміт етапу 5 000 ₴ з межею (5 000 можна, 5 001 ні) і межею віку (рівно 7 днів уже не новий)", async () => {
    const exact = await makeDeal({ owner: YOUNG.id, amount: NEW_ACCOUNT_MAX_STAGE });
    const above = await makeDeal({ owner: YOUNG.id, amount: NEW_ACCOUNT_MAX_STAGE + 1 });
    const now = YOUNG_CREATED + 2 * DAY;
    expect((await start(exact.id, { user: YOUNG, now })).ok).toBe(true);
    expect(refused(await start(above.id, { user: YOUNG, now }))).toMatchObject({ status: 409, title: "Ліміт для нового акаунта" });
    expect(await paymentRows(above.id)).toEqual([]);
    const lastMoment = YOUNG_CREATED + NEW_ACCOUNT_DAYS * DAY - 1;
    expect(refused(await start(above.id, { user: YOUNG, now: lastMoment })).status).toBe(409);
    expect((await start(above.id, { user: YOUNG, now: YOUNG_CREATED + NEW_ACCOUNT_DAYS * DAY })).ok).toBe(true);
  });

  it("виконавець без акаунта (id без користувача) чи без активних виплат: 409 «Виконавець не підключив виплати», банк не чіпаємо", async () => {
    await makeUser(ctx.db, "dm-noaccount");
    const orphan = await makeDeal({ method: "safe" });
    // Підміна виконавця на такого, що не підключав виплати.
    await ctx.db.prepare("update deals set data = json_set(data, '$.performer.id', 'me-dm-noaccount') where id = ?").bind(orphan.id).run();
    expect(refused(await start(orphan.id))).toMatchObject({ status: 409, title: "Виконавець не підключив виплати" });
    expect(invoicesCreated()).toBe(0);
    expect(await paymentRows(orphan.id)).toEqual([]);
  });

  it("банк не віддав список отримувачів: 502 «Банк не відповів», резерву платежу немає", async () => {
    const deal = await makeDeal();
    bank.state.fail.set("split-receiver/list", 500);
    expect(refused(await start(deal.id))).toMatchObject({ status: 502, title: "Банк не відповів" });
    bank.state.fail.delete("split-receiver/list");
    bank.state.fail.set("split-receiver/list", "network");
    expect(refused(await start(deal.id)).status).toBe(502);
    expect(await paymentRows(deal.id)).toEqual([]);
    expect(invoicesCreated()).toBe(0);
  });

  it("не задано отримувача платформи: 503 «Оплата тимчасово недоступна», резерву й рахунку немає", async () => {
    const deal = await makeDeal();
    delete process.env.MONOBANK_PLATFORM_RECEIVER_ID;
    expect(refused(await start(deal.id))).toMatchObject({ status: 503, title: "Оплата тимчасово недоступна" });
    process.env.MONOBANK_PLATFORM_RECEIVER_ID = "";
    expect(refused(await start(deal.id)).status).toBe(503);
    expect(await paymentRows(deal.id)).toEqual([]);
    expect(invoicesCreated()).toBe(0);
  });

  it("не задано токен терміналу розщеплення: відмова без резерву й без рахунку", async () => {
    const deal = await makeDeal();
    delete process.env.MONOBANK_SPLIT_TOKEN;
    expect(refused(await start(deal.id)).ok).toBe(false);
    expect(await paymentRows(deal.id)).toEqual([]);
    expect(invoicesCreated()).toBe(0);
  });
});

describe("startStagePayment: платіж етапу, що вже існує", () => {
  it("живий рахунок (created чи processing) використовується повторно: той самий pageUrl, reused: true, нового рахунку немає", async () => {
    const deal = await makeDeal();
    const first = await start(deal.id);
    if (!first.ok) throw new Error("перший рахунок не створено");
    const again = await start(deal.id);
    expect(again).toEqual({ ok: true, pageUrl: first.pageUrl, reused: true });
    bank.setStatus([...bank.invoices.keys()].at(-1)!, "processing");
    expect(await start(deal.id)).toEqual({ ok: true, pageUrl: first.pageUrl, reused: true });
    expect(invoicesCreated()).toBe(1);
  });

  it("банк уже тримає кошти, а вебхука ще не було: 409 «Оплату вже отримано», рахунок не дублюється, етап стає funded за відповіддю банку", async () => {
    const deal = await makeDeal();
    await start(deal.id);
    bank.setStatus([...bank.invoices.keys()].at(-1)!, "hold");
    expect(refused(await start(deal.id))).toMatchObject({ status: 409, title: "Оплату вже отримано" });
    expect(invoicesCreated()).toBe(1);
    expect((await stageOf(deal.id)).status).toBe("funded");
  });

  it("платіж уже зафіксований як hold чи success у нашій базі: 409 «Оплату вже отримано» без запиту до банку", async () => {
    for (const status of ["hold", "success"]) {
      const deal = await makeDeal();
      await start(deal.id);
      await ctx.db.prepare("update deal_payments set status = ? where deal_id = ?").bind(status, deal.id).run();
      const statusCalls = bank.count("invoice/status");
      expect(refused(await start(deal.id)), status).toMatchObject({ status: 409, title: "Оплату вже отримано" });
      expect(bank.count("invoice/status"), status).toBe(statusCalls);
    }
  });

  it("резерв ще без рахунку (creating): 409 «Рахунок створюється», банк не чіпаємо", async () => {
    const deal = await makeDeal();
    bank.state.fail.set("invoice/create", "network");
    expect(refused(await start(deal.id)).status).toBe(502);
    bank.state.fail.clear();
    const before = invoicesCreated();
    expect(refused(await start(deal.id))).toMatchObject({ status: 409, title: "Рахунок створюється" });
    expect(invoicesCreated()).toBe(before);
  });

  it("банк не відповів на звірку існуючого рахунку: 502 і новий рахунок не створюється (інакше можна заплатити двічі)", async () => {
    const deal = await makeDeal();
    await start(deal.id);
    bank.state.fail.set("invoice/status", 500);
    expect(refused(await start(deal.id))).toMatchObject({ status: 502, title: "Банк не відповів" });
    bank.state.fail.set("invoice/status", "network");
    expect(refused(await start(deal.id)).status).toBe(502);
    expect(invoicesCreated()).toBe(1);
    expect((await paymentRows(deal.id)).filter((row) => row.status !== "failure")).toHaveLength(1);
  });

  it("банк каже failure чи expired: старий платіж закривається й створюється новий рахунок", async () => {
    for (const status of ["failure", "expired"]) {
      const deal = await makeDeal();
      const first = await start(deal.id);
      if (!first.ok) throw new Error("перший рахунок не створено");
      bank.setStatus([...bank.invoices.keys()].at(-1)!, status);
      const fresh = await start(deal.id);
      expect(fresh, status).toMatchObject({ ok: true, reused: false });
      expect(fresh.ok && fresh.pageUrl, status).not.toBe(first.pageUrl);
      expect((await paymentRows(deal.id)).filter((row) => row.status === "created"), status).toHaveLength(1);
    }
  });
});

describe("startStagePayment: відповідь банку на створення рахунку", () => {
  it("однозначна відмова банку (4xx/5xx з тілом) звільняє резерв: наступна спроба проходить", async () => {
    const deal = await makeDeal();
    bank.state.fail.set("invoice/create", 400);
    expect(refused(await start(deal.id))).toMatchObject({ status: 502, title: "Банк не відповів" });
    expect((await paymentRows(deal.id)).map((row) => row.status)).toEqual(["failure"]);
    bank.state.fail.clear();
    expect(await start(deal.id)).toMatchObject({ ok: true, reused: false });
  });

  it("збій мережі: резерв лишається (рахунок міг створитися), другий не створюємо, повідомляємо «Банк не відповів»", async () => {
    const deal = await makeDeal();
    bank.state.fail.set("invoice/create", "network");
    expect(refused(await start(deal.id)).status).toBe(502);
    expect((await paymentRows(deal.id)).map((row) => row.status)).toEqual(["creating"]);
  });

  it("етап лишається «очікує оплати», доки банк не підтвердив холд", async () => {
    const deal = await makeDeal();
    await start(deal.id);
    expect((await getDealForOwner(deal.id, OWNER.id))!.stages[0].status).toBe("pending");
  });
});
