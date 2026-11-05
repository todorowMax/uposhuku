import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { dealEscrowAbi } from "@/lib/crypto/abi/deal-escrow";
import { escrowFactoryAbi } from "@/lib/crypto/abi/escrow-factory";
import { escrowStageOutcome, readEscrow, verifyEscrowCreated } from "@/lib/crypto/escrow-chain";
import { approvalSteps } from "@/lib/crypto/approvals";
import { parseCryptoConfig } from "@/lib/crypto/config";
import { dealRefOf } from "@/lib/crypto/deal-ref";
import { evaluateEvmPayment, EVM_MIN_CONFIRMATIONS, EvmUnavailableError, readEvmChain, type EvmExpectation } from "@/lib/crypto/evm";
import { buildWalletMessage, isWalletSignatureValid } from "@/lib/crypto/wallet-sign";
import { walletErrorText } from "@/lib/crypto/wallet-errors";
import { CHAIN_ID, chainWith, PAYER, paidLog, RECIPIENT, ROUTER, STRANGER, TOKEN, transferLog } from "../helpers/evm-logs";

const REF = dealRefOf("deal_1", "deal_1-s1");
const base: EvmExpectation = { chainId: CHAIN_ID, token: TOKEN, router: null, to: RECIPIENT, dealRef: REF, acceptedAt: Date.now() - 1000 };
const viaRouter: EvmExpectation = { ...base, router: ROUTER };
const plain = transferLog({ from: PAYER, to: RECIPIENT, amount: 7_000_000n });
const routed = [paidLog({ ref: REF, payer: PAYER, recipient: RECIPIENT, amount: 7_000_000n, fee: 490_000n }), plain, transferLog({ from: PAYER, to: STRANGER, amount: 490_000n })];

describe("evaluateEvmPayment: звичайний переказ", () => {
  it("вірний переказ: сума береться з журналу", () => {
    const verdict = evaluateEvmPayment({ chain: chainWith([plain]), expected: base });
    expect(verdict).toMatchObject({ ok: true, proof: { amountUnits: "7000000", feeUnits: "0" } });
  });
  it("чужий токен, чужий одержувач, невдала й неповна транзакції відхиляються", () => {
    const reason = (chain: Parameters<typeof evaluateEvmPayment>[0]["chain"], expected = base) => (evaluateEvmPayment({ chain, expected }) as { reason: string }).reason;
    expect(reason(chainWith([transferLog({ token: STRANGER, from: PAYER, to: RECIPIENT, amount: 7_000_000n })]))).toBe("wrong_token");
    expect(reason(chainWith([transferLog({ from: PAYER, to: STRANGER, amount: 7_000_000n })]))).toBe("wrong_recipient");
    expect(reason(chainWith([plain], { receipt: { status: "0x0", blockNumber: 100, logs: [plain] } }))).toBe("failed");
    expect(reason(chainWith([plain], { receipt: null }))).toBe("not_found");
    expect(reason(chainWith([plain], { latestBlock: 100 + EVM_MIN_CONFIRMATIONS - 2 }))).toBe("few_confirmations");
    expect(reason(chainWith([plain], { blockTime: base.acceptedAt - 1 }))).toBe("too_old");
    expect(reason(chainWith([plain], { chainId: 1 }))).toBe("wrong_chain");
  });
  it("рівно мінімум підтверджень проходить", () => {
    expect(evaluateEvmPayment({ chain: chainWith([plain], { latestBlock: 100 + EVM_MIN_CONFIRMATIONS - 1 }), expected: base }).ok).toBe(true);
  });
});

describe("evaluateEvmPayment: через FeeRouter", () => {
  it("вірний платіж: сума й комісія з події, звичайний переказ повз роутер відхиляється", () => {
    expect(evaluateEvmPayment({ chain: chainWith(routed), expected: viaRouter })).toMatchObject({ ok: true, proof: { amountUnits: "7000000", feeUnits: "490000", from: expect.stringMatching(/^0x/) } });
    expect(evaluateEvmPayment({ chain: chainWith([plain]), expected: viaRouter })).toMatchObject({ ok: false, reason: "no_router" });
  });
  it("чужий етап, чужий одержувач, чужий токен у події, подія без переказу", () => {
    const otherRef = dealRefOf("deal_1", "deal_1-s2");
    const reason = (logs: Parameters<typeof chainWith>[0]) => (evaluateEvmPayment({ chain: chainWith(logs), expected: viaRouter }) as { reason: string }).reason;
    expect(reason([paidLog({ ref: otherRef, payer: PAYER, recipient: RECIPIENT, amount: 7_000_000n, fee: 0n }), plain])).toBe("wrong_ref");
    expect(reason([paidLog({ ref: REF, payer: PAYER, recipient: STRANGER, amount: 7_000_000n, fee: 0n }), plain])).toBe("wrong_recipient");
    expect(reason([paidLog({ ref: REF, payer: PAYER, recipient: RECIPIENT, token: STRANGER, amount: 7_000_000n, fee: 0n }), plain])).toBe("wrong_token");
    expect(reason([paidLog({ ref: REF, payer: PAYER, recipient: RECIPIENT, amount: 7_000_000n, fee: 0n })])).toBe("wrong_token");
  });
  it("подія Paid від чужого контракту не рахується", () => {
    const fake = paidLog({ router: STRANGER, ref: REF, payer: PAYER, recipient: RECIPIENT, amount: 7_000_000n, fee: 0n });
    expect(evaluateEvmPayment({ chain: chainWith([fake, plain]), expected: viaRouter })).toMatchObject({ ok: false, reason: "no_router" });
  });
});

describe("readEvmChain", () => {
  const rpcMock = (handlers: Record<string, unknown>) =>
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => Response.json({ result: handlers[(JSON.parse(String(init?.body)) as { method: string }).method] ?? null }));
  it("читає мережу, квитанцію і час блоку; порожня квитанція це «ще немає»", async () => {
    const receipt = { status: "0x1", blockNumber: "0x64", logs: [plain] };
    const found = await readEvmChain("0x" + "a".repeat(64), "http://127.0.0.1:1", rpcMock({ eth_chainId: "0x7a69", eth_blockNumber: "0x78", eth_getTransactionReceipt: receipt, eth_getBlockByNumber: { timestamp: "0x3e8" } }) as unknown as typeof fetch);
    expect(found).toMatchObject({ chainId: 31337, latestBlock: 120, blockTime: 1_000_000, receipt: { blockNumber: 100 } });
    const missing = await readEvmChain("0x" + "a".repeat(64), "http://127.0.0.1:1", rpcMock({ eth_chainId: "0x7a69", eth_blockNumber: "0x78" }) as unknown as typeof fetch);
    expect(missing.receipt).toBeNull();
  });
  it("збій вузла, помилка RPC і порожня відповідь дають EvmUnavailableError", async () => {
    const failing = vi.fn(async () => new Response("x", { status: 502 })) as unknown as typeof fetch;
    await expect(readEvmChain("0x" + "a".repeat(64), "http://127.0.0.1:1", failing)).rejects.toBeInstanceOf(EvmUnavailableError);
    const rpcError = vi.fn(async () => Response.json({ error: { code: -1 } })) as unknown as typeof fetch;
    await expect(readEvmChain("0x" + "a".repeat(64), "http://127.0.0.1:1", rpcError)).rejects.toBeInstanceOf(EvmUnavailableError);
  });
});

describe("підпис адреси", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const input = { domain: "findlyfy.test", address: account.address, nonce: "n1", issuedAt: 1_700_000_000_000, expiresAt: 1_700_000_600_000 };
  it("своя підпис проходить; чужий ключ, інший текст і сміття ні", async () => {
    const message = buildWalletMessage(input);
    const signature = await account.signMessage({ message });
    expect(await isWalletSignatureValid({ address: account.address, message, signature })).toBe(true);
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await isWalletSignatureValid({ address: account.address, message, signature: await other.signMessage({ message }) })).toBe(false);
    expect(await isWalletSignatureValid({ address: account.address, message: buildWalletMessage({ ...input, domain: "evil.test" }), signature })).toBe(false);
    expect(await isWalletSignatureValid({ address: account.address, message, signature: "0x12" })).toBe(false);
  });
});

describe("схвалення, конфігурація, тексти помилок", () => {
  it("approvalSteps: лише точна сума, ненульове менше потрібного скидаємо спершу", () => {
    expect(approvalSteps(0n, 5n)).toEqual([5n]);
    expect(approvalSteps(3n, 5n)).toEqual([0n, 5n]);
    expect(approvalSteps(5n, 5n)).toEqual([]);
    expect(approvalSteps(9n, 5n)).toEqual([]);
    expect(approvalSteps(0n, 0n)).toEqual([]);
  });
  it("parseCryptoConfig: без мережі, токена чи RPC конфігурації немає; http лише локально", () => {
    const ok = { chainId: "42161", token: TOKEN, rpcUrl: "https://rpc.example/key" };
    expect(parseCryptoConfig(ok)).toMatchObject({ chainId: 42161, router: null, factory: null });
    expect(parseCryptoConfig({ ...ok, chainId: undefined })).toBeNull();
    expect(parseCryptoConfig({ ...ok, token: "0x123" })).toBeNull();
    expect(parseCryptoConfig({ ...ok, token: "0x" + "0".repeat(40) })).toBeNull();
    expect(parseCryptoConfig({ ...ok, rpcUrl: "http://rpc.example" })).toBeNull();
    expect(parseCryptoConfig({ ...ok, rpcUrl: "http://127.0.0.1:8545" })).not.toBeNull();
    expect(parseCryptoConfig({ ...ok, router: ROUTER })?.router).toBe("0x00000000000000000000000000000000000B2222");
  });
  it("walletErrorText: відмова, не та мережа, газ, відключення, заміна", () => {
    expect(walletErrorText({ name: "UserRejectedRequestError" })).toMatch(/відхилили/);
    expect(walletErrorText({ code: 4001, message: "x" })).toMatch(/відхилили/);
    expect(walletErrorText({ name: "TransactionExecutionError", cause: { name: "ChainMismatchError" } })).toMatch(/іншій мережі/);
    expect(walletErrorText(new Error("insufficient funds for gas * price + value"))).toMatch(/газ/);
    expect(walletErrorText({ name: "ConnectorNotConnectedError" })).toMatch(/відʼєднався/);
    expect(walletErrorText(new Error("transaction was replaced"))).toMatch(/замінено/);
    expect(walletErrorText("щось")).toMatch(/Гаманець повернув/);
  });
});

describe("ескроу в блокчейні", () => {
  const client = "0x00000000000000000000000000000000000f6666";
  const factory = "0x00000000000000000000000000000000000a7777";
  const escrow = "0x00000000000000000000000000000000000a8888";
  const created = (over: { dealRef?: Hex; client?: string; performer?: string; amount?: bigint } = {}) => {
    const args = { dealRef: over.dealRef ?? REF, escrow, client: over.client ?? client, performer: over.performer ?? RECIPIENT, amount: over.amount ?? 5n, fee: 1n, deliverBy: 100n, reviewPeriod: 86_400n };
    const topics = encodeEventTopics({ abi: escrowFactoryAbi, eventName: "DealCreated", args: { dealRef: args.dealRef, escrow: args.escrow as Hex, client: args.client as Hex } });
    const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }], [args.performer as Hex, args.amount, args.fee, args.deliverBy, args.reviewPeriod]);
    return { address: factory, topics: topics as string[], data };
  };
  const expected = { factory: factory as Hex, client, performer: RECIPIENT, amount: 5n, dealRef: REF };

  it("verifyEscrowCreated: вірна подія дає адресу клона; чужа сума, сторона, етап і чужа фабрика відхиляються", () => {
    expect(verifyEscrowCreated([created()], expected)).toMatchObject({ ok: true, fee: 1n });
    expect(verifyEscrowCreated([created({ amount: 6n })], expected)).toMatchObject({ ok: false, reason: "wrong_amount" });
    expect(verifyEscrowCreated([created({ performer: STRANGER })], expected)).toMatchObject({ ok: false, reason: "wrong_party" });
    expect(verifyEscrowCreated([created({ client: STRANGER })], expected)).toMatchObject({ ok: false, reason: "wrong_party" });
    expect(verifyEscrowCreated([created({ dealRef: dealRefOf("x", "y") })], expected)).toMatchObject({ ok: false, reason: "wrong_ref" });
    expect(verifyEscrowCreated([{ ...created(), address: STRANGER }], expected)).toMatchObject({ ok: false, reason: "no_event" });
  });

  it("escrowStageOutcome: стан контракту визначає етап; закрито без виплати це повернення", () => {
    const base = { client, performer: RECIPIENT, amount: 5n, paidToPerformer: 0n, dealRef: REF, deliverBy: 0, reviewEnds: 7 };
    expect(escrowStageOutcome({ ...base, state: 0 }).kind).toBe("none");
    expect(escrowStageOutcome({ ...base, state: 1 }).kind).toBe("funded");
    expect(escrowStageOutcome({ ...base, state: 2 })).toEqual({ kind: "delivered", reviewEnds: 7 });
    expect(escrowStageOutcome({ ...base, state: 3 }).kind).toBe("disputed");
    expect(escrowStageOutcome({ ...base, state: 4 }).kind).toBe("refunded");
    expect(escrowStageOutcome({ ...base, state: 4, paidToPerformer: 2n })).toEqual({ kind: "released", paid: 2n });
  });

  it("readEscrow: читає стан клона через eth_call; збій вузла це EvmUnavailableError", async () => {
    const word = (value: bigint | string) => (typeof value === "bigint" ? value.toString(16).padStart(64, "0") : value.slice(2).padStart(64, "0"));
    const answers: Record<string, string> = {
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "state" })]: word(2n),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "client" })]: word(client),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "performer" })]: word(RECIPIENT),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "amount" })]: word(5n),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "paidToPerformer" })]: word(0n),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "dealRef" })]: word(REF),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "deliverBy" })]: word(100n),
      [encodeFunctionData({ abi: dealEscrowAbi, functionName: "reviewEnds" })]: word(200n),
    };
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const data = (JSON.parse(String(init?.body)) as { params: [{ data: string }] }).params[0].data;
      return Response.json({ result: "0x" + answers[data] });
    }) as unknown as typeof fetch;
    const snapshot = await readEscrow("http://127.0.0.1:1", escrow as Hex, fetcher);
    expect(snapshot).toMatchObject({ state: 2, amount: 5n, reviewEnds: 200, deliverBy: 100 });
    expect(escrowStageOutcome(snapshot).kind).toBe("delivered");
    await expect(readEscrow("http://127.0.0.1:1", escrow as Hex, vi.fn(async () => new Response("x", { status: 500 })) as unknown as typeof fetch)).rejects.toBeInstanceOf(EvmUnavailableError);
  });
});
