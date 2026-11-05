// lib/crypto/tron.ts
//
// Перевірка оплати USDT TRC-20 за хешем транзакції через TronGrid. `evaluateTronTransfer` чиста: приймає
// відповіді мережі й очікування, повертає висновок. `readTronChain` єдиний ефект (fetch).
// Контракт USDT звірено зі сторінкою Tether (tether.to/en/supported-protocols); знаків після коми 6 (стандарт
// токена, на сторінці Tether не вказано). Формат відповідей звірено на живому запиті до api.trongrid.io.

import { tronAddressFromHex, tronAddressToHex } from "./tron-address";

export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const TRON_USDT_DECIMALS = 6;
export const TRON_MIN_CONFIRMATIONS = 20;
export const TRONGRID_BASE = "https://api.trongrid.io";
/** topic[0] події Transfer(address,address,uint256). */
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const isTronTxHash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);

export const tronscanLink = (hash: string): string => `https://tronscan.org/#/transaction/${hash}`;

/** Сума в мінімальних одиницях токена у вигляді «12.5» (без зайвих нулів). */
export const formatUsdt = (units: string): string => {
  const padded = units.padStart(TRON_USDT_DECIMALS + 1, "0");
  const whole = padded.slice(0, -TRON_USDT_DECIMALS);
  const fraction = padded.slice(-TRON_USDT_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

export interface TronTxInfo {
  blockNumber?: number;
  blockTimeStamp?: number;
  contract_address?: string;
  receipt?: { result?: string };
  log?: { address?: string; topics?: string[]; data?: string }[];
}

export interface TronChain {
  info: TronTxInfo | null;
  latestBlock: number | null;
}

export interface TronProof {
  from: string;
  to: string;
  amountUnits: string;
  confirmations: number;
  blockTime: number;
}

export type TronRejection = "not_found" | "failed" | "wrong_token" | "wrong_recipient" | "few_confirmations" | "too_old";
export type TronVerdict = { ok: true; proof: TronProof } | { ok: false; reason: TronRejection; confirmations?: number };

const tail20 = (hex: string): string => hex.slice(-40).toLowerCase();
const usdtHex = (): string => tronAddressToHex(TRON_USDT_CONTRACT) ?? "";

/**
 * Висновок про транзакцію: успішна, викликала саме контракт USDT, у журналі є Transfer на очікувану адресу,
 * не менше 20 підтверджень, блок після прийняття угоди. Сума береться з журналу, а не від користувача.
 */
export const evaluateTronTransfer = (input: { chain: TronChain; to: string; acceptedAt: number }): TronVerdict => {
  const { chain, to, acceptedAt } = input;
  const info = chain.info;
  if (!info || info.blockNumber === undefined || chain.latestBlock === null) return { ok: false, reason: "not_found" };
  if (info.receipt?.result !== "SUCCESS") return { ok: false, reason: "failed" };
  const token = usdtHex();
  if (!info.contract_address || tail20(info.contract_address) !== token) return { ok: false, reason: "wrong_token" };
  const wanted = tronAddressToHex(to);
  const transfer = (info.log ?? []).find((entry) => entry.address && tail20(entry.address) === token && entry.topics?.[0] === TRANSFER_TOPIC && entry.topics.length === 3);
  if (!transfer || !wanted) return { ok: false, reason: "wrong_token" };
  if (tail20(transfer.topics![2]) !== wanted) return { ok: false, reason: "wrong_recipient" };
  const confirmations = chain.latestBlock - info.blockNumber + 1;
  if (confirmations < TRON_MIN_CONFIRMATIONS) return { ok: false, reason: "few_confirmations", confirmations };
  const blockTime = info.blockTimeStamp ?? 0;
  if (blockTime <= acceptedAt) return { ok: false, reason: "too_old" };
  const amountUnits = BigInt(`0x${transfer.data || "0"}`).toString();
  return { ok: true, proof: { from: tronAddressFromHex(tail20(transfer.topics![1])), to, amountUnits, confirmations, blockTime } };
};

export class TronUnavailableError extends Error {
  constructor() {
    super("TronGrid недоступний");
    this.name = "TronUnavailableError";
  }
}

type Fetcher = typeof fetch;

const post = async (path: string, body: unknown, options: { apiKey?: string; fetcher: Fetcher }): Promise<Record<string, unknown>> => {
  const { apiKey, fetcher } = options;
  let response: Response;
  try {
    response = await fetcher(`${TRONGRID_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(apiKey ? { "TRON-PRO-API-KEY": apiKey } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TronUnavailableError();
  }
  if (!response.ok) throw new TronUnavailableError();
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new TronUnavailableError();
  }
};

/** Читає транзакцію й поточний блок. Порожня відповідь вузла означає «транзакції ще немає»; збій мережі піднімається. */
export const readTronChain = async (hash: string, apiKey?: string, fetcher: Fetcher = fetch): Promise<TronChain> => {
  const [info, block] = await Promise.all([post("/wallet/gettransactioninfobyid", { value: hash.toLowerCase() }, { apiKey, fetcher }), post("/wallet/getnowblock", {}, { apiKey, fetcher })]);
  const latest = (block.block_header as { raw_data?: { number?: number } } | undefined)?.raw_data?.number;
  if (typeof latest !== "number") throw new TronUnavailableError();
  return { info: Object.keys(info).length === 0 ? null : (info as TronTxInfo), latestBlock: latest };
};

/** Тексти для людини за причиною відмови. */
export const TRON_REJECTION_TEXT: Record<TronRejection, string> = {
  not_found: "Транзакцію не знайдено. Перевірте хеш або зачекайте кілька хвилин, поки її внесе мережа.",
  failed: "Транзакція не виконана в мережі.",
  wrong_token: "Це не переказ USDT у мережі TRON (TRC-20).",
  wrong_recipient: "Переказ пішов не на адресу виконавця з угоди. Звірте адресу.",
  few_confirmations: `Транзакції ще бракує підтверджень мережі (потрібно ${TRON_MIN_CONFIRMATIONS}). Спробуйте через кілька хвилин.`,
  too_old: "Транзакція раніше за прийняття угоди: вона не може належати цій угоді.",
};
