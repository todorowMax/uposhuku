// Ворота ескроу (lib/server/escrow-gate.ts) напряму: прапорець у того, хто створює, адреса фабрики, акаунт виконавця,
// підтверджений гаманець (зміна реквізитів діє через добу), стеля угоди (оточення проти ліміту контракту), збій
// контракту. Сам вузол підмінено: ліміт фабрики задає тест. Крізь маршрут створення угоди це покрито в
// escrow-deal.test.ts (там не видно, яка саме відмова і яка стеля).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({ readFactoryTerms: vi.fn() }));
vi.mock("@/lib/crypto/escrow-chain", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), readFactoryTerms: chain.readFactoryTerms }));

import { getAddress } from "viem";
import { EvmUnavailableError } from "@/lib/crypto/evm";
import { escrowGate } from "@/lib/server/escrow-gate";
import { saveOwnRequisites } from "@/lib/server/requisites-repo";
import { makeUser, useTestD1 } from "../helpers/d1";
import { CHAIN, FACTORY, IBAN, KEY, PERFORMER_WALLET, TOKEN, UNIT } from "../helpers/escrow-fixtures";

const DAY = 86_400_000;
const EMAIL = "eg-cust@example.com";
const UNAVAILABLE = "Ескроу ще недоступне для вашого акаунта.";
const NO_ACCOUNT = "Ескроу можливе лише з виконавцем-акаунтом.";
const NO_WALLET = "Виконавець ще не підтвердив адресу гаманця: ескроу без неї неможливе.";
const NO_CONTRACT = "Не вдалося звірити ліміт з контрактом: спробуйте пізніше.";
const ENV = ["CRYPTO_ESCROW_MODE", "CRYPTO_ESCROW_USERS", "CRYPTO_CHAIN_ID", "CRYPTO_TOKEN_ADDRESS", "CRYPTO_FACTORY_ADDRESS", "CRYPTO_RPC_URL", "CRYPTO_MAX_DEAL_USDT", "REQUISITES_KEY"];

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["eg-perf", "eg-nowallet", "eg-pending", "eg-settled", "eg-noreq"]) await makeUser(ctx.db, id);
  const requisites = { recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678" };
  await saveOwnRequisites("eg-perf", { ...requisites, walletAddress: PERFORMER_WALLET });
  await saveOwnRequisites("eg-nowallet", requisites);
  // Гаманець доданий щойно: чекає добу, поточні реквізити ще без нього.
  await saveOwnRequisites("eg-pending", requisites);
  await saveOwnRequisites("eg-pending", { ...requisites, walletAddress: PERFORMER_WALLET });
  // Гаманець доданий дві доби тому: добу очікування вже минуло.
  await saveOwnRequisites("eg-settled", requisites, Date.now() - 3 * DAY);
  await saveOwnRequisites("eg-settled", { ...requisites, walletAddress: PERFORMER_WALLET }, Date.now() - 2 * DAY);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  process.env.REQUISITES_KEY = KEY;
  process.env.CRYPTO_ESCROW_MODE = "on";
  process.env.CRYPTO_CHAIN_ID = String(CHAIN);
  process.env.CRYPTO_TOKEN_ADDRESS = TOKEN;
  process.env.CRYPTO_FACTORY_ADDRESS = FACTORY;
  process.env.CRYPTO_RPC_URL = "http://127.0.0.1:8545";
  chain.readFactoryTerms.mockReset();
  chain.readFactoryTerms.mockResolvedValue({ maxAmount: 500n * UNIT, feeBps: 500 });
});
afterEach(() => {
  for (const name of ENV) delete process.env[name];
});

const gate = (over: Partial<Parameters<typeof escrowGate>[0]> = {}) => escrowGate({ email: EMAIL, performerUserId: "eg-perf", ...over });

describe("escrowGate: чи доступне ескроу", () => {
  it("усе є: повертає стелю з контракту й питає саме цю фабрику та вузол", async () => {
    expect(await gate()).toEqual({ max: 500 });
    expect(chain.readFactoryTerms).toHaveBeenCalledTimes(1);
    expect(chain.readFactoryTerms).toHaveBeenCalledWith({ rpcUrl: "http://127.0.0.1:8545/", factory: getAddress(FACTORY) });
  });

  it("прапорець вимкнений (чи не заданий): відмова, контракт не питаємо", async () => {
    delete process.env.CRYPTO_ESCROW_MODE;
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_ESCROW_MODE = "off";
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_ESCROW_MODE = "garbage";
    expect(await gate()).toBe(UNAVAILABLE);
    expect(chain.readFactoryTerms).not.toHaveBeenCalled();
  });

  it("allowlist: пошта зі списку проходить (регістр не важливий), чужа й порожня ні", async () => {
    process.env.CRYPTO_ESCROW_MODE = "allowlist";
    process.env.CRYPTO_ESCROW_USERS = "Someone@Example.com, eg-cust@example.com";
    expect(await gate({ email: "EG-Cust@example.com" })).toEqual({ max: 500 });
    expect(await gate({ email: "other@example.com" })).toBe(UNAVAILABLE);
    expect(await gate({ email: null })).toBe(UNAVAILABLE);
    expect(await gate({ email: undefined })).toBe(UNAVAILABLE);
  });

  it("немає адреси фабрики, нульова чи нечинна адреса, чи неповна конфігурація мережі: відмова навіть з прапорцем", async () => {
    delete process.env.CRYPTO_FACTORY_ADDRESS;
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_FACTORY_ADDRESS = "0x0000000000000000000000000000000000000000";
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_FACTORY_ADDRESS = "not-an-address";
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_FACTORY_ADDRESS = FACTORY;
    delete process.env.CRYPTO_RPC_URL;
    expect(await gate()).toBe(UNAVAILABLE);
    process.env.CRYPTO_RPC_URL = "http://evil.example.com:8545";
    expect(await gate()).toBe(UNAVAILABLE);
    expect(chain.readFactoryTerms).not.toHaveBeenCalled();
  });

  it("виконавець без акаунта: окрема відмова, але лише коли функція взагалі доступна", async () => {
    expect(await gate({ performerUserId: null })).toBe(NO_ACCOUNT);
    delete process.env.CRYPTO_ESCROW_MODE;
    expect(await gate({ performerUserId: null })).toBe(UNAVAILABLE);
  });

  it("гаманець виконавця: немає реквізитів, немає гаманця чи зміна ще чекає добу: відмова; добу минуло: проходить", async () => {
    for (const performerUserId of ["eg-noreq", "eg-nowallet", "eg-pending", "eg-ghost"]) expect(await gate({ performerUserId }), performerUserId).toBe(NO_WALLET);
    expect(await gate({ performerUserId: "eg-settled" })).toEqual({ max: 500 });
    expect(chain.readFactoryTerms).toHaveBeenCalledTimes(1);
  });
});

describe("escrowGate: стеля угоди", () => {
  const limit = (maxAmount: bigint) => chain.readFactoryTerms.mockResolvedValue({ maxAmount, feeBps: 500 });

  it("оточення нижче ліміту контракту: береться оточення; вище: береться ліміт контракту; рівні: те саме число", async () => {
    process.env.CRYPTO_MAX_DEAL_USDT = "300";
    expect(await gate()).toEqual({ max: 300 });
    process.env.CRYPTO_MAX_DEAL_USDT = "800";
    expect(await gate()).toEqual({ max: 500 });
    process.env.CRYPTO_MAX_DEAL_USDT = "500";
    expect(await gate()).toEqual({ max: 500 });
  });

  it("без значення в оточенні діє типова стеля 1000, поки контракт не нижчий", async () => {
    limit(5_000n * UNIT);
    expect(await gate()).toEqual({ max: 1000 });
    limit(700n * UNIT);
    expect(await gate()).toEqual({ max: 700 });
  });

  it("нечинне значення в оточенні (не число, нуль, від'ємне, дробове) не знімає й не обнуляє стелю: типова", async () => {
    limit(5_000n * UNIT);
    for (const raw of ["abc", "0", "-5", "1.5", "", "  ", "1e3x"]) {
      process.env.CRYPTO_MAX_DEAL_USDT = raw;
      expect(await gate(), JSON.stringify(raw)).toEqual({ max: 1000 });
    }
    process.env.CRYPTO_MAX_DEAL_USDT = " 250 ";
    expect(await gate()).toEqual({ max: 250 });
  });

  it("ліміт контракту округлюється вниз до цілих USDT; нуль у контракті дає стелю 0, а не типову", async () => {
    limit(500n * UNIT + 999_999n);
    expect(await gate()).toEqual({ max: 500 });
    limit(UNIT - 1n);
    expect(await gate()).toEqual({ max: 0 });
    limit(0n);
    expect(await gate()).toEqual({ max: 0 });
  });
});

describe("escrowGate: збій контракту", () => {
  it("вузол недоступний (EvmUnavailableError): відмова з текстом, а не стеля з оточення", async () => {
    chain.readFactoryTerms.mockRejectedValue(new EvmUnavailableError());
    expect(await gate()).toBe(NO_CONTRACT);
  });

  it("будь-яка інша помилка піднімається, а не маскується під відмову", async () => {
    chain.readFactoryTerms.mockRejectedValue(new Error("несподіване"));
    await expect(gate()).rejects.toThrow("несподіване");
  });
});
