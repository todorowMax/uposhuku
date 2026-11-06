import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/admin", () => ({ getAdmin: async () => (session.user?.id === "esc-admin" ? session.user : null) }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { decodeFunctionData, encodeFunctionResult, getAddress, keccak256, toHex, type Abi, type Hex } from "viem";
import { authAttempts } from "@/db/schema";
import { dealEscrowAbi } from "@/lib/crypto/abi/deal-escrow";
import { escrowFactoryAbi } from "@/lib/crypto/abi/escrow-factory";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { predictEscrowAddress } from "@/lib/crypto/escrow-chain";
import type { Deal } from "@/lib/deals/types";
import { POST as DEAL_ACTION } from "@/app/api/deals/[id]/route";
import { POST as ESCROW_SYNC } from "@/app/api/deals/[id]/escrow-sync/route";
import { POST as CREATE_DEAL } from "@/app/api/conversations/[id]/deals/route";
import { POST as ADMIN_RESOLVE } from "@/app/api/admin/disputes/[id]/escrow-resolve/route";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { actAsPerformer, getDealById, proposeDeal } from "@/lib/server/deal-repo";
import { runDealSweep } from "@/lib/server/deal-sweep";
import { saveOwnRequisites } from "@/lib/server/requisites-repo";
import { makeUser, useTestD1 } from "../helpers/d1";
import { CHAIN, CLIENT_WALLET, draft, FACTORY, IBAN, KEY, PERFORMER_WALLET, STRANGER, TOKEN, UNIT } from "../helpers/escrow-fixtures";

/** Підроблений блокчейн: клони за адресою й відповіді eth_call від фабрики та клона. */
interface FakeClone {
  state: number;
  client: string;
  performer: string;
  amount: bigint;
  paid: bigint;
  dealRef: Hex;
  deliverBy: number;
  reviewEnds: number;
  factory: string;
}
const chain = vi.hoisted(() => ({ clones: new Map<string, unknown>(), down: false, maxAmount: 0n, feeBps: 0, calls: 0 }));
const cloneAddress = (client: string, ref: Hex) => `0x${keccak256(toHex(`${client.toLowerCase()}${ref}`)).slice(26)}`;

const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  chain.calls += 1;
  if (chain.down) return new Response("x", { status: 502 });
  const { params } = JSON.parse(String(init?.body)) as { params: [{ to: string; data: Hex }] };
  const { to, data } = params[0];
  const target = to.toLowerCase();
  if (target === FACTORY) {
    const call = decodeFunctionData({ abi: escrowFactoryAbi, data });
    if (call.functionName === "predictEscrow") {
      const [client, ref] = call.args as [string, Hex];
      return Response.json({ result: encodeFunctionResult({ abi: escrowFactoryAbi, functionName: "predictEscrow", result: cloneAddress(client, ref) as Hex }) });
    }
    if (call.functionName === "MAX_AMOUNT") return Response.json({ result: encodeFunctionResult({ abi: escrowFactoryAbi, functionName: "MAX_AMOUNT", result: chain.maxAmount }) });
    if (call.functionName === "FEE_BPS") return Response.json({ result: encodeFunctionResult({ abi: escrowFactoryAbi, functionName: "FEE_BPS", result: chain.feeBps }) });
  }
  const clone = chain.clones.get(target) as FakeClone | undefined;
  if (!clone) return Response.json({ result: "0x" });
  const call = decodeFunctionData({ abi: dealEscrowAbi, data });
  const values: Record<string, unknown> = { state: clone.state, client: clone.client, performer: clone.performer, amount: clone.amount, paidToPerformer: clone.paid, dealRef: clone.dealRef, deliverBy: BigInt(clone.deliverBy), reviewEnds: BigInt(clone.reviewEnds), FACTORY: clone.factory };
  return Response.json({ result: encodeFunctionResult({ abi: dealEscrowAbi as Abi, functionName: call.functionName, result: values[call.functionName] as never }) });
});

const fund = (deal: Deal, stageIndex = 0, over: Partial<FakeClone> = {}) => {
  const stage = deal.stages[stageIndex];
  const ref = dealRefOf(deal.id, stage.id);
  const address = cloneAddress(CLIENT_WALLET, ref);
  chain.clones.set(address.toLowerCase(), { state: 1, client: CLIENT_WALLET, performer: PERFORMER_WALLET, amount: BigInt(stage.amount) * UNIT, paid: 0n, dealRef: ref, deliverBy: 2_000_000_000, reviewEnds: 0, factory: FACTORY, ...over } satisfies FakeClone);
  return address;
};
const setClone = (address: string, patch: Partial<FakeClone>) => chain.clones.set(address.toLowerCase(), { ...(chain.clones.get(address.toLowerCase()) as FakeClone), ...patch });

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string) => (session.user = { id, email: `${id}@example.com` });
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("https://findlyfy.test/x", { method: "POST", body: JSON.stringify(body) });

/** Прийнята угода ескроу з підтвердженою адресою виконавця. */
let counter = 0;
const newEscrowDeal = async (): Promise<Deal> => {
  counter += 1;
  const created = await proposeDeal("esc-cust", draft({ responseId: `direct-${counter}` }), { safeEnabled: false, escrowMax: 1000 });
  if (typeof created === "string") throw new Error(created);
  const accepted = await actAsPerformer("esc-perf", created.id, "accept", undefined);
  if (accepted === null || typeof accepted === "string") throw new Error(String(accepted));
  return accepted;
};

beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["esc-cust", "esc-perf", "esc-other", "esc-nowal"]) await makeUser(ctx.db, id);
  await saveOwnRequisites("esc-perf", { recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", walletAddress: PERFORMER_WALLET });
  await saveOwnRequisites("esc-nowal", { recipient: "ФОП Петренко", iban: IBAN, taxCode: "12345678" });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(authAttempts);
  process.env.REQUISITES_KEY = KEY;
  process.env.CRYPTO_ESCROW_MODE = "on";
  process.env.CRYPTO_CHAIN_ID = String(CHAIN);
  process.env.CRYPTO_TOKEN_ADDRESS = TOKEN;
  process.env.CRYPTO_FACTORY_ADDRESS = FACTORY;
  process.env.CRYPTO_RPC_URL = "http://127.0.0.1:8545";
  chain.clones.clear();
  Object.assign(chain, { down: false, maxAmount: 500n * UNIT, feeBps: 500, calls: 0 });
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["CRYPTO_ESCROW_MODE", "CRYPTO_CHAIN_ID", "CRYPTO_TOKEN_ADDRESS", "CRYPTO_FACTORY_ADDRESS", "CRYPTO_RPC_URL", "CRYPTO_MAX_DEAL_USDT"]) delete process.env[name];
});

describe("адреса клона", () => {
  it("predictEscrowAddress читає predictEscrow у фабрики", async () => {
    const ref = dealRefOf("a", "b");
    expect(await predictEscrowAddress({ rpcUrl: "http://127.0.0.1:8545", factory: FACTORY as Hex, client: CLIENT_WALLET as Hex, dealRef: ref }, fakeFetch as unknown as typeof fetch)).toBe(
      getAddress(cloneAddress(CLIENT_WALLET, ref)),
    );
  });
});

describe("створення угоди ескроу", () => {
  const conversation = async () => {
    const { conversations } = await import("@/db/schema");
    await getDb().insert(conversations).values({ id: "conv-esc", customerUserId: "esc-cust", performerId: "me-esc-perf", performerUserId: "esc-perf", performerName: "Виконавець", createdAt: 1, updatedAt: 1 } as never).onConflictDoNothing();
  };
  const body = { title: "Логотип", method: "escrow", stages: [{ title: "Робота", amount: 40, days: 5 }] };

  it("потрібні прапорець у того, хто створює, підтверджений гаманець виконавця й ліміт із контракту", async () => {
    await conversation();
    as("esc-cust");
    delete process.env.CRYPTO_ESCROW_MODE;
    expect((await CREATE_DEAL(post(body), ctxOf("conv-esc"))).status).toBe(409);
    process.env.CRYPTO_ESCROW_MODE = "on";
    const created = await CREATE_DEAL(post(body), ctxOf("conv-esc"));
    expect(created.status).toBe(201);
    expect(((await created.json()) as { deal: Deal }).deal).toMatchObject({ method: "escrow", currency: "USDT" });
    // Стеля з контракту: 500 USDT, а угода на 600 відхиляється.
    const big = await CREATE_DEAL(post({ ...body, stages: [{ title: "Робота", amount: 600, days: 5 }] }), ctxOf("conv-esc"));
    expect(big.status).toBe(400);
    // Власна стеля з оточення нижча за ліміт контракту.
    process.env.CRYPTO_MAX_DEAL_USDT = "30";
    expect((await CREATE_DEAL(post(body), ctxOf("conv-esc"))).status).toBe(400);
  });

  it("без фабрики в оточенні й коли контракт не відповів ескроу не створюється", async () => {
    await conversation();
    as("esc-cust");
    chain.down = true;
    expect((await CREATE_DEAL(post(body), ctxOf("conv-esc"))).status).toBe(409);
    chain.down = false;
    delete process.env.CRYPTO_FACTORY_ADDRESS;
    expect((await CREATE_DEAL(post(body), ctxOf("conv-esc"))).status).toBe(409);
  });
});

describe("звірка з контрактом", () => {
  it("API-дії замовника й виконавця над ескроу дають 409 і не міняють статус етапу", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    const address = fund(deal);
    as("esc-cust");
    await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id));
    expect((await getDealById(deal.id))!.stages[0].status).toBe("funded");
    // Етап внесено: ні здача, ні спір, ні підтвердження словом не міняють його, лише контракт.
    expect((await DEAL_ACTION(post({ action: "dispute" }), ctxOf(deal.id))).status).toBe(409);
    as("esc-perf");
    for (const action of ["deliver", "confirm_paid"]) expect((await DEAL_ACTION(post({ as: "performer", action }), ctxOf(deal.id))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("funded");
    setClone(address, { state: 2, reviewEnds: 3_000_000_000 });
    await ESCROW_SYNC(post({ stageId: first }), ctxOf(deal.id));
    as("esc-cust");
    for (const action of ["release", "claim_paid"]) expect((await DEAL_ACTION(post({ action }), ctxOf(deal.id))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("delivered");
  });

  it("повний шлях: внесення, здача, приймання лише зі стану контракту; адресу клона рахує сервер", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    as("esc-cust");
    // Клона ще немає: нічого не змінилося.
    let response = await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id));
    expect(await response.json()).toMatchObject({ changed: false, funded: false });
    // Без гаманця замовника адресу порахувати не можна.
    expect((await ESCROW_SYNC(post({ stageId: first }), ctxOf(deal.id))).status).toBe(409);

    const address = fund(deal);
    response = await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id));
    expect(response.status).toBe(200);
    let stage = (await getDealById(deal.id))!.stages[0];
    expect(stage).toMatchObject({ status: "funded", escrow: { client: getAddress(CLIENT_WALLET) } });
    expect(stage.escrow!.address.toLowerCase()).toBe(address.toLowerCase());

    // Далі клієнту гаманець не потрібен, звіряє будь-яка сторона; стан бере лише з контракту.
    setClone(address, { state: 2, reviewEnds: 3_000_000_000 });
    as("esc-perf");
    await ESCROW_SYNC(post({ stageId: first }), ctxOf(deal.id));
    stage = (await getDealById(deal.id))!.stages[0];
    expect(stage.status).toBe("delivered");
    setClone(address, { state: 4, paid: 10n * UNIT });
    await ESCROW_SYNC(post({ stageId: first }), ctxOf(deal.id));
    expect((await getDealById(deal.id))!.stages[0]).toMatchObject({ status: "released", paidUnits: "10000000" });
  });

  it("гаманець замовника приймається лише від замовника: виконавець зі своїм клоном не позначить етап оплаченим", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    // Виконавець створює клон як «замовник» зі своїм другим гаманцем.
    const own = "0x00000000000000000000000000000000000000b2";
    const ref = dealRefOf(deal.id, first);
    chain.clones.set(cloneAddress(own, ref).toLowerCase(), { state: 1, client: own, performer: PERFORMER_WALLET, amount: BigInt(deal.stages[0].amount) * UNIT, paid: 0n, dealRef: ref, deliverBy: 2_000_000_000, reviewEnds: 0, factory: FACTORY } satisfies FakeClone);
    as("esc-perf");
    expect((await ESCROW_SYNC(post({ stageId: first, client: own }), ctxOf(deal.id))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0].status).not.toBe("funded");
  });

  it("чужа фабрика, чужий виконавець, чужа сума й чужий етап: статус не змінюється", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    as("esc-cust");
    const address = fund(deal, 0, { factory: STRANGER });
    expect((await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id))).status).toBe(409);
    setClone(address, { factory: FACTORY, performer: STRANGER });
    expect((await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id))).status).toBe(409);
    setClone(address, { performer: PERFORMER_WALLET, amount: 9n * UNIT });
    expect((await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id))).status).toBe(409);
    // Клон іншого етапу не підходить: у нього інший dealRef, а адресу рахує сервер за етапом.
    setClone(address, { amount: 10n * UNIT, dealRef: dealRefOf(deal.id, deal.stages[1].id) });
    expect((await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0]).toMatchObject({ status: "pending" });
    expect((await getDealById(deal.id))!.stages[0].escrow).toBeUndefined();
  });

  it("сторонній не бачить угоду; мережа недоступна: 503 і стан не змінено", async () => {
    const deal = await newEscrowDeal();
    as("esc-other");
    expect((await ESCROW_SYNC(post({ stageId: deal.stages[0].id }), ctxOf(deal.id))).status).toBe(404);
    as("esc-cust");
    fund(deal);
    chain.down = true;
    expect((await ESCROW_SYNC(post({ stageId: deal.stages[0].id, client: CLIENT_WALLET }), ctxOf(deal.id))).status).toBe(503);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("pending");
  });

  it("без підтвердженої адреси виконавця у знімку звірка відмовляє", async () => {
    const created = await proposeDeal("esc-cust", draft({ performer: { id: "me-esc-nowal", name: "Без гаманця", avatarIndex: 0, specialty: "", fop: false }, responseId: "direct2", requestId: "direct:conv-esc2" }), { safeEnabled: false, escrowMax: 1000 });
    if (typeof created === "string") throw new Error(created);
    await actAsPerformer("esc-nowal", created.id, "accept", undefined);
    as("esc-cust");
    expect((await ESCROW_SYNC(post({ stageId: created.stages[0].id, client: CLIENT_WALLET }), ctxOf(created.id))).status).toBe(409);
  });
});

describe("sweep ескроу", () => {
  it("звіряє етап зі станом контракту, пише нагадування один раз, а збій мережі не зупиняє решту", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    as("esc-cust");
    const address = fund(deal);
    await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id));
    setClone(address, { state: 2, reviewEnds: 1_000 });
    const report = await runDealSweep(Date.now());
    expect(report.errors).toBe(0);
    let stage = (await getDealById(deal.id))!.stages[0];
    expect(stage.status).toBe("delivered");
    // Строк перевірки вийшов: перший прохід ставить мітку нагадування, наступний уже ні.
    await runDealSweep(Date.now() + 5 * 60_000);
    stage = (await getDealById(deal.id))!.stages[0];
    expect(stage.reviewEndedRemindedAt).toBeTruthy();
    const marked = stage.reviewEndedRemindedAt;
    await runDealSweep(Date.now() + 10 * 60_000);
    expect((await getDealById(deal.id))!.stages[0].reviewEndedRemindedAt).toBe(marked);

    // Мережа лежить: помилка лічиться, стан не міняється, прохід завершується.
    setClone(address, { state: 4, paid: 10n * UNIT });
    chain.down = true;
    const failed = await runDealSweep(Date.now() + 15 * 60_000);
    expect(failed.errors).toBeGreaterThan(0);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("delivered");
    chain.down = false;
    await runDealSweep(Date.now() + 20 * 60_000);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("released");
  });

  it("без фабрики в оточенні звірка вимкнена", async () => {
    const deal = await newEscrowDeal();
    as("esc-cust");
    fund(deal);
    await ESCROW_SYNC(post({ stageId: deal.stages[0].id, client: CLIENT_WALLET }), ctxOf(deal.id));
    delete process.env.CRYPTO_FACTORY_ADDRESS;
    fakeFetch.mockClear();
    const report = await runDealSweep(Date.now());
    expect(report.escrow).toBe(0);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe("адмінка: рішення спору ескроу", () => {
  it("без адміна 404; для угоди не в спорі 409; у спорі повертає calldata resolve і пише журнал", async () => {
    const deal = await newEscrowDeal();
    const first = deal.stages[0].id;
    as("esc-cust");
    expect((await ADMIN_RESOLVE(post({ percent: 50, comment: "Рішення з пояснення" }), ctxOf(deal.id))).status).toBe(404);
    await makeUser(ctx.db, "esc-admin");
    as("esc-admin");
    const comment = "Роботу здано частково, ділимо порівну між сторонами";
    expect((await ADMIN_RESOLVE(post({ percent: 50, comment }), ctxOf(deal.id))).status).toBe(409);

    const address = fund(deal);
    as("esc-cust");
    await ESCROW_SYNC(post({ stageId: first, client: CLIENT_WALLET }), ctxOf(deal.id));
    setClone(address, { state: 3 });
    await ESCROW_SYNC(post({ stageId: first }), ctxOf(deal.id));
    expect((await getDealById(deal.id))!.stages[0].status).toBe("disputed");
    as("esc-admin");
    expect((await ADMIN_RESOLVE(post({ percent: 52, comment }), ctxOf(deal.id))).status).toBe(400);
    expect((await ADMIN_RESOLVE(post({ percent: 50, comment: "коротко" }), ctxOf(deal.id))).status).toBe(400);
    const ok = await ADMIN_RESOLVE(post({ percent: 50, comment }), ctxOf(deal.id));
    expect(ok.status).toBe(200);
    const { transaction } = (await ok.json()) as { transaction: { to: string; data: Hex; chainId: number } };
    expect(transaction.to.toLowerCase()).toBe(address.toLowerCase());
    expect(transaction.chainId).toBe(CHAIN);
    expect(decodeFunctionData({ abi: dealEscrowAbi, data: transaction.data })).toMatchObject({ functionName: "resolve", args: [50] });
    const { moderationActions } = await import("@/db/schema");
    const log = await getDb().select().from(moderationActions).where(eq(moderationActions.dealId, deal.id));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "partial", adminEmail: "esc-admin@example.com" });
  });
});
