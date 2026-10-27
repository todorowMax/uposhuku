// scripts/uapay-probe.ts
//
// Розвідка тестового середовища UAPAY (sandbox): чи працює холд на їхній сторінці
// оплати, завершення на меншу суму, скасування й повернення. Документація:
// https://uapayua.atlassian.net/wiki/spaces/AC (Швидкий старт, Invoice create,
// Invoices payments complete/cancel/reverse). Реальні гроші не рухаються.
//
// Ключ і id клієнта живуть лише в змінних середовища (.dev.vars), у вивід не потрапляють:
//   UAPAY_CLIENT_ID   id клієнта з кабінету UAPAY
//   UAPAY_SECRET      тестовий secret key магазину (кабінет → магазин → «Натисніть тут щоб побачити secret key»)
//
//   npm run uapay:probe                                        сесія + рахунок з холдом 100 ₴, друкує посилання на оплату
//   npm run uapay:probe -- show <invoiceId>                    рахунок і його платежі
//   npm run uapay:probe -- complete <invoiceId> <paymentId> [копійки]   завершити холд (можна меншою сумою)
//   npm run uapay:probe -- cancel <invoiceId> <paymentId>      скасувати холд
//   npm run uapay:probe -- reverse <invoiceId> <paymentId> [копійки]   повернути гроші після завершення
//
// Тестова картка: 4111 1111 1111 1111, 05/28, CVV 111, код lookup 111111 (успіх).
// Усі відповіді (без ключа) пишемо в .cache/uapay-probe-<час>.json.

import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = (process.env.UAPAY_BASE ?? "https://api.demo.uapay.ua").replace(/\/$/, "");
const CLIENT_ID = process.env.UAPAY_CLIENT_ID;
const SECRET = process.env.UAPAY_SECRET;

interface Call {
  label: string;
  path: string;
  request: unknown;
  status: number;
  response: unknown;
}

const log: Call[] = [];

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const b64url = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

/** JWT HS256 над payload; secret живе лише тут і не потрапляє ні у вивід, ні в журнал. */
const sign = (payload: object, secret: string): string => {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};

interface CallSpec {
  path: string;
  params: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** Запит до UAPAY: payload { params, data, iat } іде відкрито й підписаним у полі token (iat не старший за 20 с). */
const call = async (label: string, spec: CallSpec): Promise<Call> => {
  const payload = { params: spec.params, ...(spec.data ? { data: spec.data } : {}), iat: Math.floor(Date.now() / 1000) };
  const body = { ...payload, token: sign(payload, SECRET ?? "") };
  let status = 0;
  let response: unknown;
  try {
    const res = await fetch(`${BASE}${spec.path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    status = res.status;
    const text = await res.text();
    try {
      response = text ? JSON.parse(text) : null;
    } catch {
      response = text;
    }
  } catch (error) {
    response = `мережева помилка: ${error instanceof Error ? error.message : String(error)}`;
  }
  const entry: Call = { label, path: spec.path, request: payload, status, response };
  log.push(entry);
  return entry;
};

const show = (entry: Call) => {
  console.log(`\n── ${entry.label}  [POST ${entry.path}]  HTTP ${entry.status}`);
  console.log(typeof entry.response === "string" ? entry.response : JSON.stringify(entry.response, null, 2));
};

const save = () => {
  const dir = resolve(process.cwd(), ".cache");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `uapay-probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`\nУсі відповіді збережено: ${file}`);
};

/** id сесії з відповіді: документація показує і data.id, і id на верхньому рівні. */
const sessionIdOf = (response: unknown): string | undefined => {
  const body = (response ?? {}) as { id?: string; data?: { id?: string } };
  return body.data?.id ?? body.id;
};

const openSession = async (): Promise<string> => {
  const session = await call("Сесія", { path: "/api/sessions/create", params: { clientId: CLIENT_ID } });
  show(session);
  const id = sessionIdOf(session.response);
  if (!id) fail("Сесію не створено: перевірте UAPAY_CLIENT_ID і UAPAY_SECRET.");
  return id as string;
};

const probe = async () => {
  const sessionId = await openSession();
  const invoice = await call("Рахунок з холдом 100 ₴ (HOLD)", {
    path: "/api/invoicer/invoices/create",
    params: { sessionId, systemType: "ECOM" },
    data: { externalId: `probe-${Date.now()}`, type: "HOLD", amount: 10_000, reusability: false, description: "Тест: безпечна угода, холд", redirectUrl: "https://findlyfy.com" },
  });
  show(invoice);
  const data = ((invoice.response ?? {}) as { data?: { id?: string; paymentPageUrl?: string } }).data;
  if (!data?.id) return save();
  console.log(`
Далі вручну:
 1. Відкрийте ${data.paymentPageUrl} і оплатіть тестовою карткою 4111 1111 1111 1111, 05/28, CVV 111, код lookup 111111.
 2. npm run uapay:probe -- show ${data.id}          (очікуємо платіж зі статусом HOLDED, запишіть paymentId)
 3. npm run uapay:probe -- complete ${data.id} <paymentId> 6000   (завершити на меншу суму, 60 ₴)
 4. npm run uapay:probe -- reverse ${data.id} <paymentId> 1000    (повернути 10 ₴)`);
  save();
};

const paymentParams = (sessionId: string, invoiceId: string, paymentId: string) => ({ sessionId, invoiceId, paymentId });

const [command = "probe", invoiceId, paymentId, amountArg] = process.argv.slice(2);

const parseAmount = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) fail("Сума має бути цілим числом копійок.");
  return amount;
};

/** Команди над рахунком і платежем: показ, завершення холду, скасування, повернення. */
const invoiceCommand = async (sessionId: string): Promise<Call> => {
  if (!invoiceId) return fail(`Команді «${command}» потрібен invoiceId.`);
  if (command === "show") return call("Рахунок і його платежі", { path: "/api/invoicer/invoices/show", params: { sessionId, id: invoiceId } });
  if (!paymentId) return fail(`Команді «${command}» потрібен paymentId (з команди show).`);
  const params = paymentParams(sessionId, invoiceId, paymentId);
  const amount = parseAmount(amountArg);
  if (command === "complete") return call("Завершення холду", { path: "/api/invoicer/payments/complete", params: { ...params, ...(amount ? { amount } : {}) } });
  if (command === "cancel") return call("Скасування холду", { path: "/api/invoicer/payments/cancel", params });
  if (command === "reverse") return call("Повернення", { path: "/api/invoicer/payments/reverse", params, data: amount ? { amount } : {} });
  return fail(`Невідома команда «${command}». Є: probe, show, complete, cancel, reverse.`);
};

const main = async () => {
  if (!CLIENT_ID || !SECRET) fail("Задайте UAPAY_CLIENT_ID і UAPAY_SECRET (тестові дані магазину з кабінету UAPAY).");
  if (!BASE.includes(".demo.")) fail("Скрипт працює лише з тестовим середовищем (api.demo.uapay.ua).");
  if (command === "probe") return probe();
  show(await invoiceCommand(await openSession()));
  save();
};

main().catch((error) => fail(`Збій скрипта: ${error instanceof Error ? error.message : String(error)}`));
