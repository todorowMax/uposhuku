// lib/crypto/evm.ts
//
// Перевірка оплати USDT з гаманця за хешем транзакції (EVM). `evaluateEvmPayment` чиста: бере відповіді вузла
// й очікування сервера, повертає висновок. `readEvmChain` єдиний ефект (JSON-RPC через fetch до CRYPTO_RPC_URL).
// Хеш від клієнта лише вказує, де дивитися: токен, одержувач, посилання на етап і сума беруться з журналу
// транзакції, а очікування з бази й оточення. Є FeeRouter: платіж має пройти через нього (подія Paid із нашим
// dealRef); немає: звичайний Transfer токена на адресу одержувача.

import { decodeAbiParameters, getAddress, toEventSelector, type Address, type Hex } from "viem";

export const EVM_MIN_CONFIRMATIONS = 12;

const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const PAID_TOPIC = toEventSelector("Paid(bytes32,address,address,address,uint256,uint256)");

export const isEvmTxHash = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
}

export interface EvmReceipt {
  status: string;
  blockNumber: number;
  logs: EvmLog[];
}

export interface EvmChain {
  /** eth_chainId вузла: звіряємо з CRYPTO_CHAIN_ID, щоб RPC не виявився чужою мережею. */
  chainId: number;
  receipt: EvmReceipt | null;
  latestBlock: number;
  /** Час блоку транзакції, мс. */
  blockTime: number | null;
}

export interface EvmExpectation {
  chainId: number;
  token: Address;
  router: Address | null;
  /** Одержувач: підтверджена адреса гаманця виконавця зі знімка угоди. */
  to: string;
  dealRef: Hex;
  /** Прийняття угоди, мс: транзакція має бути пізніше. */
  acceptedAt: number;
}

export interface EvmProof {
  from: string;
  to: string;
  amountUnits: string;
  feeUnits: string;
  confirmations: number;
  blockTime: number;
}

export type EvmRejection = "wrong_chain" | "not_found" | "failed" | "few_confirmations" | "too_old" | "wrong_token" | "wrong_recipient" | "wrong_ref" | "no_router";
export type EvmVerdict = { ok: true; proof: EvmProof } | { ok: false; reason: EvmRejection; confirmations?: number };

export const EVM_REJECTION_TEXT: Record<EvmRejection, string> = {
  wrong_chain: "Мережа, у якій перевіряємо оплату, не збігається з налаштуваннями сайту. Спробуйте пізніше.",
  not_found: "Транзакцію не знайдено. Зачекайте кілька хвилин, поки її внесе мережа, і перевірте хеш.",
  failed: "Транзакція не виконана в мережі.",
  few_confirmations: `Транзакції ще бракує підтверджень мережі (потрібно ${EVM_MIN_CONFIRMATIONS}). Спробуйте через кілька хвилин.`,
  too_old: "Транзакція раніше за прийняття угоди: вона не може належати цій угоді.",
  wrong_token: "Це не переказ USDT, який приймає сайт.",
  wrong_recipient: "Переказ пішов не на адресу виконавця з угоди. Звірте адресу.",
  wrong_ref: "Платіж привʼязаний до іншого етапу чи угоди.",
  no_router: "Оплата має йти через платіжний контракт сайту: скористайтеся кнопкою оплати на сторінці угоди.",
};

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const topicAddress = (topic: string | undefined): string => (topic ? getAddress(`0x${topic.slice(-40)}`) : "");

interface Transfer {
  from: string;
  to: string;
  amount: bigint;
}

const tokenTransfers = (logs: EvmLog[], token: string): Transfer[] =>
  logs
    .filter((log) => sameAddress(log.address, token) && log.topics.length === 3 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC)
    .map((log) => ({ from: topicAddress(log.topics[1]), to: topicAddress(log.topics[2]), amount: BigInt(log.data || "0x0") }));

interface Paid {
  payer: string;
  recipient: string;
  token: string;
  amount: bigint;
  fee: bigint;
  dealRef: string;
}

const routerPayment = (logs: EvmLog[], router: string): Paid | null => {
  const log = logs.find((item) => sameAddress(item.address, router) && item.topics.length === 4 && item.topics[0]?.toLowerCase() === PAID_TOPIC);
  if (!log) return null;
  try {
    const [token, amount, fee] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], log.data as Hex);
    return { dealRef: log.topics[1]!.toLowerCase(), payer: topicAddress(log.topics[2]), recipient: topicAddress(log.topics[3]), token, amount, fee };
  } catch {
    return null;
  }
};

type Found = { ok: true; from: string; to: string; amount: bigint; fee: bigint } | { ok: false; reason: EvmRejection };

/** З журналу: через FeeRouter (подія Paid + Transfer на одержувача) або простий Transfer токена. */
const findPayment = (logs: EvmLog[], expected: EvmExpectation): Found => {
  const transfers = tokenTransfers(logs, expected.token);
  if (!expected.router) {
    const hit = transfers.find((item) => sameAddress(item.to, expected.to));
    if (hit) return { ok: true, from: hit.from, to: hit.to, amount: hit.amount, fee: 0n };
    return { ok: false, reason: transfers.length > 0 ? "wrong_recipient" : "wrong_token" };
  }
  const paid = routerPayment(logs, expected.router);
  if (!paid) return { ok: false, reason: "no_router" };
  if (!sameAddress(paid.token, expected.token)) return { ok: false, reason: "wrong_token" };
  if (paid.dealRef !== expected.dealRef.toLowerCase()) return { ok: false, reason: "wrong_ref" };
  if (!sameAddress(paid.recipient, expected.to)) return { ok: false, reason: "wrong_recipient" };
  // Подія Paid без справжнього переказу токена не рахується.
  const moved = transfers.some((item) => sameAddress(item.from, paid.payer) && sameAddress(item.to, expected.to) && item.amount === paid.amount);
  return moved ? { ok: true, from: paid.payer, to: paid.recipient, amount: paid.amount, fee: paid.fee } : { ok: false, reason: "wrong_token" };
};

/** Висновок про транзакцію. Порядок перевірок: мережа, наявність, успіх, підтвердження, час, зміст. */
export const evaluateEvmPayment = (input: { chain: EvmChain; expected: EvmExpectation }): EvmVerdict => {
  const { chain, expected } = input;
  if (chain.chainId !== expected.chainId) return { ok: false, reason: "wrong_chain" };
  const receipt = chain.receipt;
  if (!receipt) return { ok: false, reason: "not_found" };
  if (receipt.status !== "0x1") return { ok: false, reason: "failed" };
  const confirmations = chain.latestBlock - receipt.blockNumber + 1;
  if (confirmations < EVM_MIN_CONFIRMATIONS) return { ok: false, reason: "few_confirmations", confirmations };
  const blockTime = chain.blockTime ?? 0;
  if (blockTime <= expected.acceptedAt) return { ok: false, reason: "too_old" };
  const found = findPayment(receipt.logs, expected);
  if (!found.ok) return found;
  return { ok: true, proof: { from: found.from, to: found.to, amountUnits: found.amount.toString(), feeUnits: found.fee.toString(), confirmations, blockTime } };
};

export class EvmUnavailableError extends Error {
  constructor() {
    super("RPC недоступний");
    this.name = "EvmUnavailableError";
  }
}

type Fetcher = typeof fetch;

const rpc = async (url: string, call: { method: string; params: unknown[] }, fetcher: Fetcher): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...call }), signal: AbortSignal.timeout(8000) });
  } catch {
    throw new EvmUnavailableError();
  }
  if (!response.ok) throw new EvmUnavailableError();
  try {
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    if (body.error !== undefined) throw new EvmUnavailableError();
    return body.result ?? null;
  } catch {
    throw new EvmUnavailableError();
  }
};

const quantity = (value: unknown): number => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new EvmUnavailableError();
  return Number(BigInt(value));
};

/** Читає мережу, транзакцію й час її блоку. Порожня квитанція означає «ще немає»; збій вузла піднімається помилкою. */
export const readEvmChain = async (hash: string, rpcUrl: string, fetcher: Fetcher = fetch): Promise<EvmChain> => {
  const [chainId, latest, raw] = await Promise.all([
    rpc(rpcUrl, { method: "eth_chainId", params: [] }, fetcher),
    rpc(rpcUrl, { method: "eth_blockNumber", params: [] }, fetcher),
    rpc(rpcUrl, { method: "eth_getTransactionReceipt", params: [hash] }, fetcher),
  ]);
  const base = { chainId: quantity(chainId), latestBlock: quantity(latest) };
  if (!raw || typeof raw !== "object") return { ...base, receipt: null, blockTime: null };
  const source = raw as { status?: unknown; blockNumber?: unknown; logs?: unknown };
  if (typeof source.status !== "string" || !Array.isArray(source.logs)) throw new EvmUnavailableError();
  const receipt: EvmReceipt = { status: source.status, blockNumber: quantity(source.blockNumber), logs: source.logs as EvmLog[] };
  const block = (await rpc(rpcUrl, { method: "eth_getBlockByNumber", params: [source.blockNumber, false] }, fetcher)) as { timestamp?: unknown } | null;
  if (!block) throw new EvmUnavailableError();
  return { ...base, receipt, blockTime: quantity(block.timestamp) * 1000 };
};
