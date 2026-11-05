import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
const mail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/mail", () => ({ sendRequisitesChangeNotice: mail }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { authAttempts, cryptoProofs, walletChallenges } from "@/db/schema";
import { GET as CONFIG } from "@/app/api/crypto/config/route";
import { POST as CHALLENGE } from "@/app/api/requisites/wallet/challenge/route";
import { POST as VERIFY } from "@/app/api/requisites/wallet/route";
import { GET as OWN, PUT as SAVE } from "@/app/api/requisites/route";
import { GET as DEAL_REQ } from "@/app/api/deals/[id]/requisites/route";
import { POST as WALLET_PAY } from "@/app/api/deals/[id]/wallet-pay/route";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { EVM_MIN_CONFIRMATIONS } from "@/lib/crypto/evm";
import { actAsPerformer, getDealById, proposeDeal } from "@/lib/server/deal-repo";
import { getDb } from "@/lib/server/db";
import { attachWalletAddress, REQUISITES_DELAY_MS } from "@/lib/server/requisites-repo";
import { CHAIN_ID, paidLog, PAYER, ROUTER, STRANGER, TOKEN, transferLog } from "../helpers/evm-logs";
import { makeUser, useTestD1 } from "../helpers/d1";
import type { EvmLog } from "@/lib/crypto/evm";

const KEY = Buffer.alloc(32, 9).toString("base64");
const IBAN = "UA213223130000026007233566001";
const performerWallet = privateKeyToAccount(generatePrivateKey());
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (id: string) => (session.user = { id, email: `${id}@example.com` });
const json = (body: unknown) => new Request("https://findlyfy.test/x", { method: "POST", body: JSON.stringify(body) });

/** Підміна вузла: квитанція, висота блоку і збій. */
const rpc = vi.hoisted(() => ({ logs: [] as EvmLog[], found: true, latest: 0, fail: false, blockTime: 0 }));

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["wl-cust", "wl-perf", "wl-other", "wl-nowal"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(authAttempts);
  process.env.REQUISITES_KEY = KEY;
  process.env.CRYPTO_WALLET_MODE = "on";
  process.env.CRYPTO_CHAIN_ID = String(CHAIN_ID);
  process.env.CRYPTO_TOKEN_ADDRESS = TOKEN;
  process.env.CRYPTO_RPC_URL = "http://127.0.0.1:8545";
  delete process.env.CRYPTO_ROUTER_ADDRESS;
  mail.mockReset();
  Object.assign(rpc, { logs: [], found: true, latest: 100 + EVM_MIN_CONFIRMATIONS - 1, fail: false, blockTime: Math.floor(Date.now() / 1000) + 60 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (rpc.fail) return new Response("x", { status: 502 });
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      const results: Record<string, unknown> = {
        eth_chainId: "0x" + CHAIN_ID.toString(16),
        eth_blockNumber: "0x" + rpc.latest.toString(16),
        eth_getTransactionReceipt: rpc.found ? { status: "0x1", blockNumber: "0x64", logs: rpc.logs } : null,
        eth_getBlockByNumber: { timestamp: "0x" + rpc.blockTime.toString(16) },
      };
      return Response.json({ result: results[method] ?? null });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ["CRYPTO_WALLET_MODE", "CRYPTO_CHAIN_ID", "CRYPTO_TOKEN_ADDRESS", "CRYPTO_RPC_URL", "CRYPTO_ROUTER_ADDRESS"]) delete process.env[name];
});

const saveReq = (over: Record<string, unknown> = {}) => SAVE(new Request("https://findlyfy.test/x", { method: "PUT", body: JSON.stringify({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", ...over }) }));
const challenge = async (address: string) => (await (await CHALLENGE(json({ address }))).json()) as { nonce: string; message: string };
const ownBody = async () => (await (await OWN()).json()) as { requisites: { walletAddress?: string } | null; pending: { requisites: { walletAddress?: string } } | null; wallet: boolean };

describe("налаштування й прапорець", () => {
  it("без прапорця чи без адрес в оточенні оплата вимкнена; з усім видно мережу без RPC", async () => {
    as("wl-perf");
    delete process.env.CRYPTO_WALLET_MODE;
    expect(((await (await CONFIG(new Request("https://findlyfy.test/x"))).json()) as { wallet: boolean }).wallet).toBe(false);
    expect((await CHALLENGE(json({ address: performerWallet.address }))).status).toBe(409);
    process.env.CRYPTO_WALLET_MODE = "on";
    delete process.env.CRYPTO_TOKEN_ADDRESS;
    expect(((await (await CONFIG(new Request("https://findlyfy.test/x"))).json()) as { wallet: boolean }).wallet).toBe(false);
    process.env.CRYPTO_TOKEN_ADDRESS = TOKEN;
    const text = await (await CONFIG(new Request("https://findlyfy.test/x"))).text();
    expect(JSON.parse(text)).toMatchObject({ wallet: true, escrow: false, config: { chainId: CHAIN_ID } });
    expect(text).not.toContain("127.0.0.1");
  });
});

describe("підтвердження адреси підписом", () => {
  it("спершу потрібні реквізити; потім підпис ставить адресу в очікування на 24 години й шле лист", async () => {
    as("wl-other");
    const first = await challenge(performerWallet.address);
    const signature = await performerWallet.signMessage({ message: first.message });
    expect((await VERIFY(json({ nonce: first.nonce, signature }))).status).toBe(409);

    expect((await saveReq()).status).toBe(200);
    const next = await challenge(performerWallet.address);
    const response = await VERIFY(json({ nonce: next.nonce, signature: await performerWallet.signMessage({ message: next.message }) }));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { outcome: { kind: string } }).outcome.kind).toBe("pending");
    expect(mail).toHaveBeenCalledTimes(1);
    const own = await ownBody();
    expect(own.requisites?.walletAddress).toBeUndefined();
    expect(own.pending?.requisites.walletAddress).toBe(performerWallet.address);
  });

  it("повтор запиту, чужий ключ, чужий користувач і прострочений запит відхиляються; запит палиться одразу", async () => {
    as("wl-perf");
    expect((await saveReq()).status).toBe(200);
    const good = await challenge(performerWallet.address);
    const signature = await performerWallet.signMessage({ message: good.message });
    const stranger = privateKeyToAccount(generatePrivateKey());
    expect((await VERIFY(json({ nonce: good.nonce, signature: await stranger.signMessage({ message: good.message }) }))).status).toBe(400);
    expect((await VERIFY(json({ nonce: good.nonce, signature }))).status).toBe(409);

    const mine = await challenge(performerWallet.address);
    as("wl-other");
    expect((await VERIFY(json({ nonce: mine.nonce, signature: await performerWallet.signMessage({ message: mine.message }) }))).status).toBe(409);
    as("wl-perf");
    const old = await challenge(performerWallet.address);
    await getDb().update(walletChallenges).set({ expiresAt: Date.now() - 1 }).where(eq(walletChallenges.nonce, old.nonce));
    expect((await VERIFY(json({ nonce: old.nonce, signature: await performerWallet.signMessage({ message: old.message }) }))).status).toBe(409);
  });

  it("адреса з форми не приймається, а підтверджена переживає повторне збереження реквізитів", async () => {
    as("wl-perf");
    await attachWalletAddress("wl-perf", performerWallet.address, Date.now() - 2 * REQUISITES_DELAY_MS);
    expect((await saveReq({ walletAddress: STRANGER, recipient: "ФОП Петренко" })).status).toBe(200);
    const own = await ownBody();
    expect(own.requisites?.walletAddress).toBe(performerWallet.address);
    expect(own.pending?.requisites.walletAddress).toBe(performerWallet.address);
  });
});

/** Прийнята пряма угода: виконавець уже має підтверджену адресу, знімок бере її. */
const newDeal = async (tag: string, performer = "wl-perf") => {
  as(performer);
  expect((await saveReq()).status).toBe(200);
  if (performer === "wl-perf") await attachWalletAddress(performer, performerWallet.address, Date.now() - 2 * REQUISITES_DELAY_MS);
  const deal = await proposeDeal("wl-cust", { requestId: `r-${tag}`, responseId: `x-${tag}`, method: "direct", performer: { id: `me-${performer}`, name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, { safeEnabled: true });
  if (typeof deal === "string") throw new Error(deal);
  await actAsPerformer(performer, deal.id, "accept", undefined, Date.now() - 120_000);
  return deal;
};
const hashOf = (char: string) => "0x" + char.repeat(64);
const pay = (id: string, hash: unknown) => WALLET_PAY(json({ hash }), ctxOf(id));
const stageStatus = async (id: string) => (await getDealById(id))!.stages[0].status;

describe("POST /api/deals/:id/wallet-pay", () => {
  it("вірний переказ: етап claimed, доказ у базі, той самий хеш в іншій угоді 409", async () => {
    const deal = await newDeal("ok");
    rpc.logs = [transferLog({ from: PAYER, to: performerWallet.address, amount: 7_000_000n })];
    as("wl-cust");
    const snapshot = (await (await DEAL_REQ(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).json()) as { requisites: { walletAddress?: string } };
    expect(snapshot.requisites.walletAddress).toBe(performerWallet.address);
    const response = await pay(deal.id, hashOf("a"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { proof: { amount: string } }).proof.amount).toBe("7");
    expect(await stageStatus(deal.id)).toBe("claimed");
    expect((await getDb().select().from(cryptoProofs).where(eq(cryptoProofs.txHash, hashOf("a"))))[0]).toMatchObject({ chain: "evm", amountUnits: "7000000" });

    const second = await newDeal("dup");
    as("wl-cust");
    expect((await pay(second.id, hashOf("a"))).status).toBe(409);
    expect(await stageStatus(second.id)).toBe("pending");
  });

  it("чужий токен, чужий одержувач, мало підтверджень, не знайдено: 409 і етап не міняється", async () => {
    const deal = await newDeal("bad");
    as("wl-cust");
    rpc.logs = [transferLog({ token: STRANGER, from: PAYER, to: performerWallet.address, amount: 7_000_000n })];
    expect((await pay(deal.id, hashOf("b"))).status).toBe(409);
    rpc.logs = [transferLog({ from: PAYER, to: STRANGER, amount: 7_000_000n })];
    expect((await pay(deal.id, hashOf("c"))).status).toBe(409);
    rpc.logs = [transferLog({ from: PAYER, to: performerWallet.address, amount: 7_000_000n })];
    rpc.latest = 100;
    expect((await pay(deal.id, hashOf("d"))).status).toBe(409);
    rpc.latest = 200;
    rpc.found = false;
    expect((await pay(deal.id, hashOf("e"))).status).toBe(409);
    expect(await stageStatus(deal.id)).toBe("pending");
    expect(await getDb().select().from(cryptoProofs).where(eq(cryptoProofs.dealId, deal.id))).toHaveLength(0);
  });

  it("вузол недоступний: 503 і стан той самий; хеш не спалено", async () => {
    const deal = await newDeal("down");
    as("wl-cust");
    rpc.logs = [transferLog({ from: PAYER, to: performerWallet.address, amount: 1n })];
    rpc.fail = true;
    expect((await pay(deal.id, hashOf("f"))).status).toBe(503);
    rpc.fail = false;
    expect((await pay(deal.id, hashOf("f"))).status).toBe(200);
  });

  it("з FeeRouter платіж має містити подію з посиланням на цей етап", async () => {
    process.env.CRYPTO_ROUTER_ADDRESS = ROUTER;
    const deal = await newDeal("router");
    as("wl-cust");
    const transfer = transferLog({ from: PAYER, to: performerWallet.address, amount: 7_000_000n });
    rpc.logs = [transfer];
    expect((await pay(deal.id, hashOf("1"))).status).toBe(409);
    rpc.logs = [paidLog({ ref: dealRefOf(deal.id, "інший"), payer: PAYER, recipient: performerWallet.address, amount: 7_000_000n, fee: 1n }), transfer];
    expect((await pay(deal.id, hashOf("2"))).status).toBe(409);
    rpc.logs = [paidLog({ ref: dealRefOf(deal.id, deal.stages[0].id), payer: PAYER, recipient: performerWallet.address, amount: 7_000_000n, fee: 490_000n }), transfer];
    expect((await pay(deal.id, hashOf("3"))).status).toBe(200);
  });

  it("не замовник 404, без прапорця 409, без адреси гаманця 409, некоректний хеш 400", async () => {
    const deal = await newDeal("guard");
    rpc.logs = [transferLog({ from: PAYER, to: performerWallet.address, amount: 7_000_000n })];
    as("wl-perf");
    expect((await pay(deal.id, hashOf("4"))).status).toBe(404);
    as("wl-cust");
    expect((await pay(deal.id, "0x12")).status).toBe(400);
    process.env.CRYPTO_WALLET_MODE = "off";
    expect((await pay(deal.id, hashOf("4"))).status).toBe(409);
    process.env.CRYPTO_WALLET_MODE = "on";
    const bare = await newDeal("nowallet", "wl-nowal");
    as("wl-cust");
    expect((await pay(bare.id, hashOf("5"))).status).toBe(409);
    expect(await stageStatus(bare.id)).toBe("pending");
  });
});
