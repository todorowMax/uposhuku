import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@/lib/crypto/sha256";
import { base58Decode, isValidTronAddress, tronAddressFromHex, tronAddressToHex } from "@/lib/crypto/tron-address";
import { evaluateTronTransfer, formatUsdt, readTronChain, TRON_MIN_CONFIRMATIONS, TRON_USDT_CONTRACT, TronUnavailableError, type TronChain } from "@/lib/crypto/tron";
import { validateRequisites, withoutCrypto } from "@/lib/deals/requisites";

const USDT_HEX = tronAddressToHex(TRON_USDT_CONTRACT)!;
const RECIPIENT = tronAddressFromHex("a".repeat(40));
const PAYER_HEX = "b".repeat(40);
const pad = (hex20: string) => hex20.padStart(64, "0");
const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BLOCK = 1000;
const ACCEPTED = 1_700_000_000_000;

const chain = (over: Partial<NonNullable<TronChain["info"]>> = {}, latest = BLOCK + TRON_MIN_CONFIRMATIONS - 1): TronChain => ({
  latestBlock: latest,
  info: {
    blockNumber: BLOCK,
    blockTimeStamp: ACCEPTED + 60_000,
    contract_address: `41${USDT_HEX}`,
    receipt: { result: "SUCCESS" },
    log: [{ address: USDT_HEX, topics: [TRANSFER, pad(PAYER_HEX), pad("a".repeat(40))], data: (12_500_000).toString(16).padStart(64, "0") }],
    ...over,
  },
});
const judge = (value: TronChain, to = RECIPIENT) => evaluateTronTransfer({ chain: value, to, acceptedAt: ACCEPTED });

describe("SHA-256 і адреси TRON", () => {
  it("sha256 збігається з node:crypto на межах блоку", () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 200]) {
      const data = Uint8Array.from({ length }, (_, index) => (index * 7 + 3) % 256);
      expect(Buffer.from(sha256(data)).toString("hex")).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });

  it("контракт USDT з сторінки Tether є вірною адресою, зіпсована ні", () => {
    expect(isValidTronAddress(TRON_USDT_CONTRACT)).toBe(true);
    expect(tronAddressFromHex(USDT_HEX)).toBe(TRON_USDT_CONTRACT);
    const broken = `${TRON_USDT_CONTRACT.slice(0, 10)}${TRON_USDT_CONTRACT[10] === "a" ? "b" : "a"}${TRON_USDT_CONTRACT.slice(11)}`;
    expect(isValidTronAddress(broken)).toBe(false);
    for (const bad of ["", "T123", "0x" + "a".repeat(40), TRON_USDT_CONTRACT.toLowerCase(), `${TRON_USDT_CONTRACT}1`]) expect(isValidTronAddress(bad)).toBe(false);
    expect(base58Decode("0OIl")).toBeNull();
  });

  it("реквізити: адреса TRC-20 і Binance ID перевіряються, withoutCrypto їх прибирає", () => {
    const base = { recipient: "ФОП Іваненко", iban: "UA213223130000026007233566001", taxCode: "12345678" };
    expect(validateRequisites({ ...base, usdtTrc20: RECIPIENT, binanceId: "123456789" })).toMatchObject({ ok: true, value: { usdtTrc20: RECIPIENT, binanceId: "123456789" } });
    expect(validateRequisites({ ...base, usdtTrc20: "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" })).toMatchObject({ ok: false });
    expect(validateRequisites({ ...base, usdtTrc20: "0x" + "a".repeat(40) })).toMatchObject({ ok: false });
    expect(validateRequisites({ ...base, binanceId: "12ab" })).toMatchObject({ ok: false });
    const full = validateRequisites({ ...base, usdtTrc20: RECIPIENT, binanceId: "123456789" });
    if (!full.ok) throw new Error("очікували ok");
    expect(withoutCrypto(full.value)).toEqual(base);
  });
});

describe("оцінка транзакції TRON", () => {
  it("вірний переказ: сума з журналу, відправник, підтвердження", () => {
    const verdict = judge(chain());
    expect(verdict).toMatchObject({ ok: true, proof: { amountUnits: "12500000", to: RECIPIENT, confirmations: TRON_MIN_CONFIRMATIONS, from: tronAddressFromHex(PAYER_HEX) } });
    expect(formatUsdt("12500000")).toBe("12.5");
    expect(formatUsdt("500")).toBe("0.0005");
    expect(formatUsdt("3000000")).toBe("3");
  });

  it("чужий токен, чужий одержувач, невдала транзакція, мало підтверджень, стара транзакція, невідома", () => {
    const foreignToken = "c".repeat(40);
    expect(judge(chain({ contract_address: `41${foreignToken}`, log: [{ address: foreignToken, topics: [TRANSFER, pad(PAYER_HEX), pad("a".repeat(40))], data: "0".repeat(64) }] }))).toMatchObject({ ok: false, reason: "wrong_token" });
    expect(judge(chain({ log: [{ address: foreignToken, topics: [TRANSFER, pad(PAYER_HEX), pad("a".repeat(40))], data: "0".repeat(64) }] }))).toMatchObject({ ok: false, reason: "wrong_token" });
    expect(judge(chain(), tronAddressFromHex("d".repeat(40)))).toMatchObject({ ok: false, reason: "wrong_recipient" });
    expect(judge(chain({ receipt: { result: "REVERT" } }))).toMatchObject({ ok: false, reason: "failed" });
    expect(judge(chain({}, BLOCK + TRON_MIN_CONFIRMATIONS - 2))).toMatchObject({ ok: false, reason: "few_confirmations", confirmations: TRON_MIN_CONFIRMATIONS - 1 });
    expect(judge(chain({ blockTimeStamp: ACCEPTED - 1 }))).toMatchObject({ ok: false, reason: "too_old" });
    expect(judge({ info: null, latestBlock: BLOCK })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("readTronChain: порожня відповідь це «немає», збій мережі чи HTTP це TronUnavailableError, ключ іде заголовком", async () => {
    const answer = (info: unknown) =>
      vi.fn(async (url: string | URL | Request, _init?: RequestInit) => Response.json(String(url).endsWith("getnowblock") ? { block_header: { raw_data: { number: 5 } } } : info));
    expect(await readTronChain("A".repeat(64), "key", answer({}) as unknown as typeof fetch)).toEqual({ info: null, latestBlock: 5 });
    const spy = answer({ blockNumber: 1 });
    await readTronChain("a".repeat(64), "key", spy as unknown as typeof fetch);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "TRON-PRO-API-KEY": "key" });
    await expect(readTronChain("a".repeat(64), undefined, (async () => new Response("x", { status: 503 })) as unknown as typeof fetch)).rejects.toBeInstanceOf(TronUnavailableError);
    await expect(readTronChain("a".repeat(64), undefined, (async () => Promise.reject(new Error("net"))) as unknown as typeof fetch)).rejects.toBeInstanceOf(TronUnavailableError);
  });
});
