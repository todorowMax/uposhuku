// lib/monobank/client.ts
//
// Клієнт інтернет-еквайрингу Monobank для безпечної угоди: рахунок з холдом і
// розщепленням, статус, фіналізація, скасування й повернення, отримувачі.
// Поведінку банку звірено тестом 26.10.2026 (docs/monobank-questions.md):
// фіналізація й повернення довільної суми працюють лише з позиціями корзини.
// Основа з Укошика (lib/monobank/client.ts), додано холд і фіналізацію.

import { z } from "zod";
import type { BasketItem } from "@/lib/deals/basket";
import { readVar } from "@/lib/server/env";

const API_BASE = "https://api.monobank.ua";
/** Назву мають передавати в кожному рахунку (вимога банку). */
const CMS = "findlyfy";

export class MonobankError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Термінал банку: `plain` (звичайні оплати, розміщення на карті, MONOBANK_TOKEN) або `split` (безпечна угода з
 * розщепленням, MONOBANK_SPLIT_TOKEN). Токени різні, і вебхук підписує той термінал, чий це рахунок.
 */
export type Terminal = "plain" | "split";

export const TERMINALS: readonly Terminal[] = ["plain", "split"];

const TOKEN_VAR = { plain: "MONOBANK_TOKEN", split: "MONOBANK_SPLIT_TOKEN" } as const;

/** Токен терміналу або undefined, якщо не заданий: щоб перевірка підпису могла пропустити відсутній термінал. */
export const terminalToken = (terminal: Terminal): string | undefined => readVar(TOKEN_VAR[terminal]);

export const getMonobankToken = (terminal: Terminal = "plain"): string => {
  const token = terminalToken(terminal);
  if (!token) throw new Error(`Не заданий ${TOKEN_VAR[terminal]}. Тестовий — з https://api.monobank.ua/, бойовий — з кабінету web.monobank.ua.`);
  return token;
};

const invoiceStatus = z.enum(["created", "processing", "hold", "success", "failure", "reversed", "expired"]);
export type InvoiceStatus = z.infer<typeof invoiceStatus>;

const cancelEntry = z.object({
  status: z.string(),
  amount: z.number(),
  splitReceiverId: z.string().optional(),
  extRef: z.string().optional(),
  modifiedDate: z.string().optional(),
});

/** Тіло статусу рахунку й вебхука: вони однакові. Зайві поля банку ігноруємо. */
export const invoiceStatusResponse = z.object({
  invoiceId: z.string(),
  status: invoiceStatus,
  amount: z.number(),
  ccy: z.number().optional(),
  finalAmount: z.number().optional(),
  createdDate: z.string().optional(),
  modifiedDate: z.string(),
  reference: z.string().optional(),
  failureReason: z.string().optional(),
  cancelList: z.array(cancelEntry).optional(),
  paymentInfo: z
    .object({ fee: z.number().optional(), agentFee: z.number().optional(), country: z.string().optional(), paymentSystem: z.string().optional() })
    .optional(),
});
export type InvoiceStatusResponse = z.infer<typeof invoiceStatusResponse>;

const created = z.object({ invoiceId: z.string(), pageUrl: z.string() });
const receiverList = z.object({ list: z.array(z.object({ id: z.string(), edrpou: z.string(), name: z.string() })) });
/** Отримувач розщеплення (сабмерчант), як його знає банк. ІПН (edrpou) зіставляємо з виконавцем. */
export type SplitReceiver = z.infer<typeof receiverList>["list"][number];
const cancelResult = z.object({ status: z.enum(["processing", "success", "failure"]) });

const request = async <T>(path: string, schema: z.ZodType<T>, init: RequestInit & { terminal?: Terminal }): Promise<T> => {
  const { terminal, ...rest } = init;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: { "X-Token": getMonobankToken(terminal), "X-Cms": CMS, "content-type": "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    let code: string | null = null;
    let detail = text.slice(0, 200);
    try {
      const body = JSON.parse(text) as { errCode?: unknown; errText?: unknown };
      code = typeof body.errCode === "string" || typeof body.errCode === "number" ? String(body.errCode) : null;
      if (typeof body.errText === "string") detail = body.errText;
    } catch {
      // Тіло не JSON: лишаємо початок тексту як є.
    }
    throw new MonobankError(`Monobank ${path} → ${response.status}: ${detail}`, response.status, code);
  }
  return schema.parse(text ? JSON.parse(text) : {});
};

/** Позиція корзини рахунку: `splitReceiverId` потрібен лише для розщеплення (безпечна угода); розміщення на карті платиться без нього. */
export type InvoiceItem = Omit<BasketItem, "splitReceiverId"> & { splitReceiverId?: string };

export interface CreateInvoiceInput {
  /** Сума «до оплати» в копійках; має дорівнювати сумі корзини. */
  amount: number;
  reference: string;
  destination: string;
  webHookUrl: string;
  redirectUrl?: string;
  /** Холд до фіналізації (у нас 30 днів). Без нього списання одразу. */
  hold: boolean;
  /** Термінал; без значення plain. Безпечна угода йде через split. */
  terminal?: Terminal;
  basketOrder: InvoiceItem[];
}

export const createInvoice = (input: CreateInvoiceInput): Promise<{ invoiceId: string; pageUrl: string }> =>
  request("/api/merchant/invoice/create", created, {
    terminal: input.terminal,
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      ccy: 980,
      paymentType: input.hold ? "hold" : "debit",
      webHookUrl: input.webHookUrl,
      ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
      merchantPaymInfo: { reference: input.reference, destination: input.destination, basketOrder: input.basketOrder },
    }),
  });

export const getInvoiceStatus = (invoiceId: string, terminal: Terminal = "plain"): Promise<InvoiceStatusResponse> =>
  request(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`, invoiceStatusResponse, { method: "GET", terminal });

/**
 * Фіналізація холду. Без `amount` і `items` списується вся сума. Для частини
 * передаємо `amount` і `items` з точних вихідних позицій (інакше банк відповідає
 * «wrong amount for finalization without basket»).
 */
export const finalizeInvoice = (input: { invoiceId: string; amount?: number; items?: BasketItem[]; terminal?: Terminal }): Promise<{ status: string }> => {
  const { terminal, ...body } = input;
  return request("/api/merchant/invoice/finalize", z.object({ status: z.string() }), { method: "POST", body: JSON.stringify(body), terminal });
};

/**
 * Скасування холду або повернення. Без позицій повертаються обидві долі, з
 * позиціями лише вибрані (повернення довільної суми без позицій банк відхиляє).
 * Повернення після фіналізації можливе лише коли рахунок завершено (`success`).
 */
export const cancelInvoice = (input: { invoiceId: string; extRef?: string; amount?: number; items?: BasketItem[]; terminal?: Terminal }): Promise<{ status: string }> => {
  const { terminal, ...body } = input;
  return request("/api/merchant/invoice/cancel", cancelResult, { method: "POST", body: JSON.stringify(body), terminal });
};

/** Сабмерчанти, яких банк додав нам для розщеплення. У тестовому середовищі id змінюються при кожному запиті. */
export const listSplitReceivers = async (): Promise<SplitReceiver[]> =>
  (await request("/api/merchant/split-receiver/list", receiverList, { method: "GET", terminal: "split" })).list;
