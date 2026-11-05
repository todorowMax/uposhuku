import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", async () => ({ getSessionUser: async () => (await import("../helpers/money-mocks")).session.user }));
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: async () => true }));
vi.mock("@/lib/server/notify", async () => ({ notifyLater: (await import("../helpers/money-mocks")).notifyLater, notifyUser: vi.fn() }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendAdminNotice: (await import("../helpers/money-mocks")).adminMail }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET as PAY_STATE } from "@/app/api/deals/[id]/pay/route";
import { actAsPerformer, getDealForOwner, mutateDeal } from "@/lib/server/deal-repo";
import { settleStage } from "@/lib/server/deal-money";
import { findPaymentByInvoice, getPayment } from "@/lib/server/payment-repo";
import { makeUser, type useTestD1 } from "../helpers/d1";
import { bank, session } from "../helpers/money-mocks";
import { act, ctxFor, delivered, funded, initMoneyDb, newDeal, OWNER, pay, setupMoneyEnv, stageOf, teardownMoneyEnv, TOTAL, webhook } from "../helpers/money-harness";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await initMoneyDb();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(setupMoneyEnv);
afterEach(teardownMoneyEnv);

describe("оплата етапу: POST /api/deals/:id/pay", () => {
  it("рахунок з холдом на терміналі розщеплення; етап лишається «очікує оплати», доки банк не підтвердить холд", async () => {
    const deal = await newDeal();
    const response = await pay(deal.id);
    expect(response.status).toBe(201);
    const { pageUrl } = (await response.json()) as { pageUrl: string };
    expect(pageUrl).toMatch(/^https:\/\/pay\.monobank\.ua\//);
    const created = bank.last("invoice/create")!;
    expect(created.token).toBe("split-token");
    expect(created.body).toMatchObject({ amount: TOTAL, paymentType: "hold" });
    const basket = (created.body!.merchantPaymInfo as { basketOrder: { sum: number; splitReceiverId: string }[] }).basketOrder;
    expect(basket.reduce((sum, item) => sum + item.sum, 0)).toBe(TOTAL);
    expect(new Set(basket.map((item) => item.splitReceiverId))).toEqual(new Set(["recv-perf", "recv-platform"]));
    // «Заморожено» ще ніхто не підтвердив.
    expect((await stageOf(deal.id)).status).toBe("pending");
    expect(await findPaymentByInvoice("monobank", "inv-1")).toMatchObject({ status: "created", amount: TOTAL });
  });

  it("повторне натискання повертає той самий рахунок, другого не створює; прострочений замінюється новим", async () => {
    const deal = await newDeal();
    const first = (await (await pay(deal.id)).json()) as { pageUrl: string };
    const again = await pay(deal.id);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { pageUrl: string }).pageUrl).toBe(first.pageUrl);
    expect(bank.count("invoice/create")).toBe(1);

    bank.setStatus([...bank.invoices.keys()].at(-1)!, "expired");
    const fresh = await pay(deal.id);
    expect(fresh.status).toBe(201);
    expect(bank.count("invoice/create")).toBe(2);
  });

  it("двоє одночасних натискань створюють один рахунок", async () => {
    const deal = await newDeal();
    const results = await Promise.all([pay(deal.id), pay(deal.id)]);
    expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(bank.count("invoice/create")).toBe(1);
  });

  it("не заказчик 404; без режиму 409; виконавець без активного рахунку 409; банк мовчить 502 і етап вільний", async () => {
    const deal = await newDeal();
    session.user = { id: "dm-other", email: "dm-other@example.com" };
    expect((await pay(deal.id)).status).toBe(404);
    session.user = OWNER;
    process.env.SAFE_DEAL_MODE = "off";
    expect((await pay(deal.id)).status).toBe(409);
    process.env.SAFE_DEAL_MODE = "allowlist";
    process.env.SAFE_DEAL_USERS = "somebody@example.com";
    expect((await pay(deal.id)).status).toBe(409);
    process.env.SAFE_DEAL_USERS = OWNER.email;
    bank.state.fail.set("invoice/create", 500);
    expect((await pay(deal.id)).status).toBe(502);
    bank.state.fail.delete("invoice/create");
    expect((await pay(deal.id)).status).toBe(201);
    delete process.env.SAFE_DEAL_USERS;

    await makeUser(ctx.db, "dm-noaccount");
    const orphan = await newDeal("me-dm-noaccount");
    expect((await pay(orphan.id)).status).toBe(409);
    expect(bank.calls.filter((call) => call.path === "invoice/create")).toHaveLength(2);
  });

  it("мережевий збій при створенні рахунку: резерв живий, вебхук знаходить платіж за reference", async () => {
    const deal = await newDeal();
    bank.state.fail.set("invoice/create", "network");
    expect((await pay(deal.id)).status).toBe(502);
    bank.state.fail.clear();
    // Банк насправді створив рахунок, відповідь загубилась: нова оплата до сплину резерву заблокована.
    expect((await pay(deal.id)).status).toBe(409);
    const reservation = (await ctx.db.prepare("select id from deal_payments where deal_id = ? and status = 'creating'").bind(deal.id).first<{ id: string }>())!;
    bank.invoices.set("inv-lost", { invoiceId: "inv-lost", status: "hold", amount: TOTAL, modifiedDate: "2026-11-05T11:00:00Z", reference: reservation.id });
    expect((await webhook("inv-lost")).status).toBe(200);
    expect((await stageOf(deal.id)).status).toBe("funded");
    expect((await getPayment(reservation.id))?.invoiceId).toBe("inv-lost");
  });
});

describe("статус від банку: вебхук тільки сигнал, правда з перепитаного статусу", () => {
  it("холд підтверджено → етап funded з holdUntil; повторний вебхук нічого не міняє", async () => {
    const { deal, invoiceId } = await funded();
    const stage = await stageOf(deal.id);
    expect(stage.holdUntil).toBeTruthy();
    expect(stage.payment?.total).toBe(TOTAL);
    const again = await webhook(invoiceId);
    expect(again.status).toBe(200);
    expect(await stageOf(deal.id)).toEqual(stage);
  });

  it("підроблене тіло вебхука «hold» не заморожує: банк на запит статусу каже created", async () => {
    const deal = await newDeal();
    await pay(deal.id);
    const invoiceId = [...bank.invoices.keys()].at(-1)!;
    expect((await webhook(invoiceId, { status: "hold", modifiedDate: "2030-01-01T00:00:00Z" })).status).toBe(200);
    expect((await stageOf(deal.id)).status).toBe("pending");
  });

  it("сума банку не збігається з нашою: етап не заморожується", async () => {
    const deal = await newDeal();
    await pay(deal.id);
    const invoiceId = [...bank.invoices.keys()].at(-1)!;
    bank.setStatus(invoiceId, "hold", { amount: TOTAL - 100 });
    await webhook(invoiceId);
    expect((await stageOf(deal.id)).status).toBe("pending");
  });

  it("старе подія за modifiedDate відкидається без запиту до банку", async () => {
    const { invoiceId } = await funded();
    const before = bank.count("invoice/status");
    const stale = await webhook(invoiceId, { modifiedDate: "2020-01-01T00:00:00Z", status: "created" });
    expect(stale.status).toBe(200);
    expect(bank.count("invoice/status")).toBe(before);
  });

  it("повернення на сайт: GET /pay перепитує банк і заморожує етап", async () => {
    const deal = await newDeal();
    await pay(deal.id);
    const invoiceId = [...bank.invoices.keys()].at(-1)!;
    bank.setStatus(invoiceId, "hold");
    const response = await PAY_STATE(new Request("https://findlyfy.test/x"), ctxFor(deal.id));
    expect(await response.json()).toMatchObject({ status: "hold", deal: { stages: [{ status: "funded" }] } });
  });

  it("холд минув до здачі (expired): етап знову чекає оплати й можна платити заново", async () => {
    const { deal, invoiceId } = await funded();
    bank.setStatus(invoiceId, "expired");
    await webhook(invoiceId);
    expect((await stageOf(deal.id)).status).toBe("pending");
    expect((await pay(deal.id)).status).toBe(201);
  });
});

describe("приймання: гроші лише після відповіді банку", () => {
  it("повний шлях: приймання → releasing → банк processing → success → released, угода завершена", async () => {
    const { deal, invoiceId } = await delivered();
    const response = await act(deal.id, "release");
    expect(response.status).toBe(200);
    expect(bank.last("invoice/finalize")!.body).toMatchObject({ invoiceId, amount: TOTAL });
    // Банк відповів processing: «виплачено» ще немає.
    expect((await stageOf(deal.id)).status).toBe("releasing");
    expect((await getDealForOwner(deal.id, OWNER.id))!.status).toBe("accepted");

    bank.setStatus(invoiceId, "success", { finalAmount: TOTAL });
    await webhook(invoiceId);
    const done = (await getDealForOwner(deal.id, OWNER.id))!;
    expect(done.stages[0]).toMatchObject({ status: "released", paidAmount: TOTAL });
    expect(done.status).toBe("completed");
  });

  it("подвійне приймання: одночасні запити викликають банк один раз", async () => {
    const { deal } = await delivered();
    const results = await Promise.all([act(deal.id, "release"), act(deal.id, "release")]);
    expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    expect(bank.count("invoice/finalize")).toBe(1);
    expect((await stageOf(deal.id)).status).toBe("releasing");
  });

  it("повторне приймання після успіху: виплата не повторюється", async () => {
    const { deal, invoiceId } = await delivered();
    await act(deal.id, "release");
    bank.setStatus(invoiceId, "success", { finalAmount: TOTAL });
    await webhook(invoiceId);
    expect((await act(deal.id, "release")).status).toBe(409);
    expect(bank.count("invoice/finalize")).toBe(1);
  });

  it("приймання і спір одночасно: виграє один, станів «спір + виплата» не буває", async () => {
    const { deal } = await delivered();
    const results = await Promise.all([act(deal.id, "release"), act(deal.id, "dispute")]);
    expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
    const stage = await stageOf(deal.id);
    expect(["releasing", "disputed"]).toContain(stage.status);
    // Банк викликано рівно тоді, коли виграло приймання.
    expect(bank.count("invoice/finalize")).toBe(stage.status === "releasing" ? 1 : 0);
  });

  it("банк однозначно відмовив: етап знову «здано», текст для людини, гроші не рухались", async () => {
    const { deal } = await delivered();
    bank.state.fail.set("invoice/finalize", 400);
    const response = await act(deal.id, "release");
    expect(response.status).toBe(409);
    const stage = await stageOf(deal.id);
    expect(stage.status).toBe("delivered");
    expect(stage.payoutError).toMatch(/Банк не прийняв/);
    // Після відмови можна спробувати знову.
    bank.state.fail.clear();
    expect((await act(deal.id, "release")).status).toBe(200);
    expect((await stageOf(deal.id)).status).toBe("releasing");
  });

  it("банк не відповів (збій мережі): виплату не відкочуємо, етап лишається releasing для sweep", async () => {
    const { deal } = await delivered();
    bank.state.fail.set("invoice/finalize", "network");
    const response = await act(deal.id, "release");
    expect(response.status).toBe(200);
    expect((await stageOf(deal.id)).status).toBe("releasing");
  });

  it("банк відмовив, але рахунок уже виконується іншим викликом: етап не відкочується назад", async () => {
    const { deal, invoiceId } = await delivered();
    bank.state.fail.set("invoice/finalize", 400);
    bank.state.beforeFail = () => void bank.setStatus(invoiceId, "processing");
    const response = await act(deal.id, "release");
    // Відкат у «здано» дозволив би другу виплату поверх чужої: етап лишається releasing.
    expect(response.status).toBe(200);
    expect((await stageOf(deal.id)).status).toBe("releasing");
    bank.state.fail.clear();
    bank.setStatus(invoiceId, "success", { finalAmount: TOTAL });
    await webhook(invoiceId);
    expect((await stageOf(deal.id)).status).toBe("released");
  });
});

describe("довершення виплати", () => {
  it("двоє одночасних довершувачів (вебхук, sweep, людина) викликають банк один раз", async () => {
    const { deal, invoiceId } = await delivered();
    bank.state.fail.set("invoice/finalize", "network");
    await act(deal.id, "release");
    bank.state.fail.clear();
    bank.calls.length = 0;
    const later = Date.now() + 10 * 60_000;
    const outcomes = await Promise.all([settleStage(deal.id, deal.stages[0].id, later), settleStage(deal.id, deal.stages[0].id, later)]);
    expect(bank.calls.filter((call) => call.path === "invoice/finalize" && (call.body as { invoiceId: string }).invoiceId === invoiceId)).toHaveLength(1);
    expect(outcomes.map((item) => item.kind)).toContain("busy");
  });
});

describe("рішення модератора: гроші теж лише після банку", () => {
  it("часткова виплата: finalize з позиціями, відсоток кратний 5, потрібне підтвердження", async () => {
    const { deal, invoiceId } = await funded();
    await actAsPerformer("dm-perf", deal.id, "deliver", undefined);
    await act(deal.id, "dispute");
    const { actAsModerator } = await import("@/lib/server/deal-repo");
    const admin = { userId: "dm-owner", email: "adm@example.com", comment: "Робота виконана частково." };
    expect(await actAsModerator(deal.id, "partial", undefined, { ...admin, percent: 60 })).toMatch(/необоротна/);
    expect(await actAsModerator(deal.id, "partial", undefined, { ...admin, percent: 63, confirm: true })).toMatch(/кратний 5/);
    const decision = await actAsModerator(deal.id, "partial", undefined, { ...admin, percent: 60, confirm: true });
    expect(typeof decision).toBe("object");
    expect((await stageOf(deal.id)).payout).toEqual({ kind: "partial", percent: 60 });
    await settleStage(deal.id, deal.stages[0].id);
    const body = bank.last("invoice/finalize")!.body as { amount: number; items: { code: string }[] };
    expect(body.items.length).toBe(24); // 12 частин виконавця + 12 частин платформи
    expect(body.amount).toBeLessThan(TOTAL);
    bank.setStatus(invoiceId, "success", { finalAmount: body.amount });
    await webhook(invoiceId);
    expect(await stageOf(deal.id)).toMatchObject({ status: "released", paidAmount: body.amount });
  });

  it("повернення: cancel, і «повернено» з угодою «скасовано» лише після reversed від банку", async () => {
    const { deal } = await funded();
    await actAsPerformer("dm-perf", deal.id, "deliver", undefined);
    await act(deal.id, "dispute");
    const { actAsModerator } = await import("@/lib/server/deal-repo");
    const decision = await actAsModerator(deal.id, "refund", undefined, { userId: "dm-owner", email: "adm@example.com", comment: "Роботи немає, повертаємо." });
    expect(typeof decision).toBe("object");
    expect((await stageOf(deal.id)).status).toBe("refunding");
    await settleStage(deal.id, deal.stages[0].id);
    expect(bank.count("invoice/cancel")).toBe(1);
    const done = (await getDealForOwner(deal.id, OWNER.id))!;
    expect(done.stages[0].status).toBe("refunded");
    expect(done.status).toBe("cancelled");
  });

  it("rework грошей не рухає", async () => {
    const { deal } = await funded();
    await actAsPerformer("dm-perf", deal.id, "deliver", undefined);
    await act(deal.id, "dispute");
    const { actAsModerator } = await import("@/lib/server/deal-repo");
    await actAsModerator(deal.id, "rework", undefined, { userId: "dm-owner", email: "adm@example.com", comment: "Виправте розбіжності." });
    expect(bank.count("invoice/finalize") + bank.count("invoice/cancel")).toBe(0);
    expect((await stageOf(deal.id)).status).toBe("funded");
  });
});

describe("конкурентні записи угоди", () => {
  it("запис з застарілим updated_at не перезаписує: mutateDeal перечитує й застосовує до свіжого", async () => {
    const deal = await newDeal();
    const results = await Promise.all([
      mutateDeal(deal.id, (current) => ({ ...current, description: `${current.description ?? ""}a` })),
      mutateDeal(deal.id, (current) => ({ ...current, description: `${current.description ?? ""}b` })),
    ]);
    expect(results.every((item) => typeof item === "object" && item !== null)).toBe(true);
    // Обидві зміни збереглися, жодна не затерла іншу.
    expect([...(((await getDealForOwner(deal.id, OWNER.id))!.description ?? "").split(""))].sort()).toEqual(["a", "b"]);
  });
});
