import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/mail", () => ({ sendRequisitesChangeNotice: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { authAttempts, cryptoProofs } from "@/db/schema";
import { PUT as SAVE_REQ, GET as OWN_REQ } from "@/app/api/requisites/route";
import { GET as DEAL_REQ } from "@/app/api/deals/[id]/requisites/route";
import { GET as PROOFS, POST as PROOF } from "@/app/api/deals/[id]/crypto-proof/route";
import { tronAddressFromHex, tronAddressToHex } from "@/lib/crypto/tron-address";
import { TRON_MIN_CONFIRMATIONS, TRON_USDT_CONTRACT } from "@/lib/crypto/tron";
import { actAsPerformer, getDealById, proposeDeal } from "@/lib/server/deal-repo";
import { getDb } from "@/lib/server/db";
import { makeUser, useTestD1 } from "../helpers/d1";

const KEY = Buffer.alloc(32, 7).toString("base64");
const USDT_HEX = tronAddressToHex(TRON_USDT_CONTRACT)!;
const ADDRESS = tronAddressFromHex("a".repeat(40));
const IBAN = "UA213223130000026007233566001";
const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (hex: string) => hex.padStart(64, "0");
const hashOf = (char: string) => char.repeat(64);

/** Підміна TronGrid: транзакція за хешем і поточний блок. */
const net = vi.hoisted(() => ({ info: {} as Record<string, unknown>, fail: false, latest: 0 }));
const txInfo = (over: Record<string, unknown> = {}, to = "a".repeat(40)) => ({
  blockNumber: 1000,
  blockTimeStamp: Date.now() + 60_000,
  contract_address: `41${USDT_HEX}`,
  receipt: { result: "SUCCESS" },
  log: [{ address: USDT_HEX, topics: [TRANSFER, pad("b".repeat(40)), pad(to)], data: (7_000_000).toString(16).padStart(64, "0") }],
  ...over,
});

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["cp-cust", "cp-perf", "cp-other"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(authAttempts);
  process.env.REQUISITES_KEY = KEY;
  process.env.CRYPTO_PROOF_MODE = "on";
  net.info = txInfo();
  net.fail = false;
  net.latest = 1000 + TRON_MIN_CONFIRMATIONS - 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      if (net.fail) return new Response("x", { status: 502 });
      return Response.json(String(url).endsWith("getnowblock") ? { block_header: { raw_data: { number: net.latest } } } : net.info);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRYPTO_PROOF_MODE;
});

const as = (id: string) => (session.user = { id, email: `${id}@example.com` });
const saveReq = (over: Record<string, unknown> = {}) => SAVE_REQ(new Request("https://findlyfy.test/x", { method: "PUT", body: JSON.stringify({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", ...over }) }));
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const prove = (id: string, hash: unknown) => PROOF(new Request("https://findlyfy.test/x", { method: "POST", body: JSON.stringify({ hash }) }), ctxOf(id));

/** Нова прийнята пряма угода, виконавець має адресу USDT. */
const newDeal = async (tag: string, withAddress = true) => {
  as("cp-perf");
  if (withAddress) expect((await saveReq({ usdtTrc20: ADDRESS, binanceId: "123456789" })).status).toBeLessThan(500);
  const deal = await proposeDeal("cp-cust", { requestId: `r-${tag}`, responseId: `x-${tag}`, method: "direct", performer: { id: "me-cp-perf", name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, { safeEnabled: true });
  if (typeof deal === "string") throw new Error(deal);
  await actAsPerformer("cp-perf", deal.id, "accept", undefined, Date.now() - 120_000);
  return deal;
};

describe("крипто-реквізити та прапорець", () => {
  it("без прапорця адресу не зберегти (409), і вона не видна; з прапорцем зберігається й видна у знімку лише тому, кому ввімкнено", async () => {
    delete process.env.CRYPTO_PROOF_MODE;
    as("cp-other");
    expect((await saveReq({ usdtTrc20: ADDRESS })).status).toBe(409);
    expect((await saveReq()).status).toBe(200);
    process.env.CRYPTO_PROOF_MODE = "on";
    const own = (await (await OWN_REQ()).json()) as { crypto: boolean };
    expect(own.crypto).toBe(true);

    const deal = await newDeal("flag");
    as("cp-cust");
    const withFlag = (await (await DEAL_REQ(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).json()) as { requisites: { usdtTrc20?: string }; crypto: boolean };
    expect(withFlag).toMatchObject({ crypto: true, requisites: { usdtTrc20: ADDRESS } });
    process.env.CRYPTO_PROOF_MODE = "allowlist";
    process.env.CRYPTO_PROOF_USERS = "somebody@example.com";
    const without = (await (await DEAL_REQ(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).json()) as { requisites: Record<string, unknown>; crypto: boolean };
    delete process.env.CRYPTO_PROOF_USERS;
    expect(without.crypto).toBe(false);
    expect(without.requisites).not.toHaveProperty("usdtTrc20");
    expect(without.requisites).not.toHaveProperty("binanceId");
  });
});

describe("POST /api/deals/:id/crypto-proof", () => {
  it("вірна оплата: етап claimed, сума й посилання видні обом сторонам; повтор хеша в іншій угоді 409", async () => {
    const deal = await newDeal("ok");
    as("cp-cust");
    const response = await prove(deal.id, hashOf("1").toUpperCase());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { proof: { amount: string; explorerUrl: string } };
    expect(body.proof).toMatchObject({ amount: "7", explorerUrl: `https://tronscan.org/#/transaction/${hashOf("1")}` });
    expect((await getDealById(deal.id))!.stages[0].status).toBe("claimed");

    for (const id of ["cp-cust", "cp-perf"]) {
      as(id);
      const seen = (await (await PROOFS(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).json()) as { proofs: { amount: string }[] };
      expect(seen.proofs).toHaveLength(1);
      expect(seen.proofs[0].amount).toBe("7");
    }
    as("cp-other");
    expect((await PROOFS(new Request("https://findlyfy.test/x"), ctxOf(deal.id))).status).toBe(404);

    const second = await newDeal("dup");
    as("cp-cust");
    const repeated = await prove(second.id, hashOf("1"));
    expect(repeated.status).toBe(409);
    expect((await getDealById(second.id))!.stages[0].status).toBe("pending");
  });

  it("чужий токен, чужий одержувач, мало підтверджень, невдала транзакція: 409, етап і таблиця не змінюються", async () => {
    const deal = await newDeal("bad");
    as("cp-cust");
    const attempts: [string, () => void][] = [
      ["2", () => (net.info = txInfo({ contract_address: `41${"c".repeat(40)}` }))],
      ["3", () => (net.info = txInfo({}, "d".repeat(40)))],
      ["4", () => (net.latest = 1000)],
      ["5", () => (net.info = txInfo({ receipt: { result: "REVERT" } }))],
      ["6", () => (net.info = {})],
    ];
    for (const [char, setup] of attempts) {
      net.info = txInfo();
      net.latest = 1000 + TRON_MIN_CONFIRMATIONS - 1;
      setup();
      expect((await prove(deal.id, hashOf(char))).status).toBe(409);
    }
    expect((await getDealById(deal.id))!.stages[0].status).toBe("pending");
    expect(await getDb().select().from(cryptoProofs).where(eq(cryptoProofs.dealId, deal.id))).toHaveLength(0);
  });

  it("мережа недоступна: 503 і стан той самий; транзакція раніше за прийняття угоди: 409", async () => {
    const deal = await newDeal("net");
    as("cp-cust");
    net.fail = true;
    expect((await prove(deal.id, hashOf("7"))).status).toBe(503);
    net.fail = false;
    net.info = txInfo({ blockTimeStamp: 1_000 });
    expect((await prove(deal.id, hashOf("7"))).status).toBe(409);
    expect((await getDealById(deal.id))!.stages[0].status).toBe("pending");
  });

  it("поганий хеш 400; чужий користувач 404; без прапорця 409; виконавець не може; адреси немає 409", async () => {
    const deal = await newDeal("guard");
    as("cp-cust");
    expect((await prove(deal.id, "zzz")).status).toBe(400);
    as("cp-other");
    expect((await prove(deal.id, hashOf("8"))).status).toBe(404);
    as("cp-perf");
    expect((await prove(deal.id, hashOf("8"))).status).toBe(404);
    as("cp-cust");
    delete process.env.CRYPTO_PROOF_MODE;
    expect((await prove(deal.id, hashOf("8"))).status).toBe(409);
    process.env.CRYPTO_PROOF_MODE = "on";
    expect((await prove(deal.id, hashOf("8"))).status).toBe(200);
    // Етап уже claimed: повторно оплату не приймаємо.
    expect((await prove(deal.id, hashOf("9"))).status).toBe(409);
  });
});
