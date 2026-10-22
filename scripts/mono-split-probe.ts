// scripts/mono-split-probe.ts
//
// Розвідка тестового середовища Monobank: чи вміє воно холд разом із розщепленням
// і як поводиться з фіналізацією й поверненням. У публічній документації розділ
// розщеплення не має методу фіналізації, а відповіді банку про «холд + сплит»
// ще нема, тож перевіряємо руками, нічого не будуючи в застосунку.
//
// Токен тестовий, з https://api.monobank.ua/, і живе лише в змінній середовища,
// у файли й у вивід він не потрапляє. Реальні гроші не рухаються.
//
//   MONO_TEST_TOKEN=... npm run mono:probe                    створює кілька рахунків і друкує підсумок
//   MONO_TEST_TOKEN=... npm run mono:probe -- status <id>     статус рахунку
//   MONO_TEST_TOKEN=... npm run mono:probe -- finalize <id> [копійки]
//   MONO_TEST_TOKEN=... npm run mono:probe -- cancel <id> [копійки]
//   MONO_TEST_TOKEN=... npm run mono:probe -- remove <id>
//
// Необов'язково: MONO_RECEIVER_PERFORMER і MONO_RECEIVER_PLATFORM (splitReceiverId
// виконавця й нашого ФОП), MONO_BASE_URL (за замовчуванням https://api.monobank.ua).
// Усі відповіді (без токена) пишемо в .cache/mono-probe-<час>.json.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = (process.env.MONO_BASE_URL ?? "https://api.monobank.ua").replace(/\/$/, "");
const TOKEN = process.env.MONO_TEST_TOKEN;
/** Назву мають передавати в кожному рахунку (вимога банку). */
const CMS = "findlyfy";
const TEST_CARD = "4444 3333 2222 1111";

interface Call {
  label: string;
  method: string;
  path: string;
  request?: unknown;
  status: number;
  response: unknown;
}

const log: Call[] = [];

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const call = async (label: string, method: "GET" | "POST", path: string, body?: unknown): Promise<Call> => {
  const headers: Record<string, string> = { "X-Token": TOKEN ?? "", "X-Cms": CMS };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let status = 0;
  let response: unknown;
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
  const entry: Call = { label, method, path, request: body, status, response };
  log.push(entry);
  return entry;
};

const show = (entry: Call) => {
  const ok = entry.status >= 200 && entry.status < 300;
  console.log(`\n── ${entry.label}  [${entry.method} ${entry.path}]  ${ok ? "OK" : "ПОМИЛКА"} ${entry.status}`);
  console.log(typeof entry.response === "string" ? entry.response : JSON.stringify(entry.response, null, 2));
};

const save = () => {
  const dir = resolve(process.cwd(), ".cache");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `mono-probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`\nУсі відповіді збережено: ${file}`);
};

/** Шукаємо в довільній відповіді список отримувачів: беремо перше рядкове поле з типовою назвою. */
const receiverIds = (response: unknown): string[] => {
  const rows = Array.isArray(response)
    ? response
    : response && typeof response === "object"
      ? Object.values(response as Record<string, unknown>).find(Array.isArray) ?? []
      : [];
  const ids: string[] = [];
  for (const row of rows as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = ["splitReceiverId", "id", "receiverId", "code"].map((key) => record[key]).find((value) => typeof value === "string");
    if (typeof id === "string") ids.push(id);
  }
  return ids;
};

const item = (name: string, sum: number, splitReceiverId?: string) => ({
  name,
  qty: 1,
  sum,
  code: name === "Комісія платформи" ? "fee" : "work",
  ...(splitReceiverId ? { splitReceiverId } : {}),
});

interface Variant {
  label: string;
  body: Record<string, unknown>;
}

const AMOUNT = 10_000; // 100 грн
const FEE = Math.round(AMOUNT * 0.05); // 5 грн: наша частка

const variants = (performer: string, platform: string): Variant[] => {
  const info = (basketOrder: unknown[], tag: string) => ({
    reference: `probe-${Date.now()}-${tag}`,
    destination: "Тест: безпечна угода",
    basketOrder,
  });
  const split = [item("Робота виконавця", AMOUNT - FEE, performer), item("Комісія платформи", FEE, platform)];
  return [
    { label: "A. холд без розщеплення (контроль)", body: { amount: AMOUNT, paymentType: "hold", merchantPaymInfo: info([item("Робота виконавця", AMOUNT)], "a") } },
    { label: "B. звичайний платіж + розщеплення 95/5", body: { amount: AMOUNT, merchantPaymInfo: info(split, "b") } },
    { label: "C. холд + розщеплення 95/5 (наш сценарій)", body: { amount: AMOUNT, paymentType: "hold", merchantPaymInfo: info(split, "c") } },
    {
      label: "D. холд + розщеплення, лише виконавець + agentFeePercent 5",
      body: { amount: AMOUNT, paymentType: "hold", agentFeePercent: 5, merchantPaymInfo: info([item("Робота виконавця", AMOUNT, performer)], "d") },
    },
    {
      label: "E. розщеплення, сума кошика не дорівнює amount (95 + 4)",
      body: { amount: AMOUNT, paymentType: "hold", merchantPaymInfo: info([item("Робота виконавця", AMOUNT - FEE, performer), item("Комісія платформи", FEE - 100, platform)], "e") },
    },
  ];
};

const probe = async () => {
  console.log(`Сервер: ${BASE}\nX-Cms: ${CMS}`);

  const details = await call("Дані мерчанта (перевірка токена)", "GET", "/api/merchant/details");
  show(details);
  if (details.status === 403) fail("\nТокен не підійшов (403). Візьміть тестовий токен на https://api.monobank.ua/.");

  const receivers = await call("Список отримувачів розщеплення", "GET", "/api/merchant/split-receiver/list");
  show(receivers);
  const submerchants = await call("Список субмерчантів", "GET", "/api/merchant/submerchant/list");
  show(submerchants);

  const found = [...receiverIds(receivers.response), ...receiverIds(submerchants.response)];
  const performer = process.env.MONO_RECEIVER_PERFORMER ?? found[0] ?? "test-performer";
  const platform = process.env.MONO_RECEIVER_PLATFORM ?? found[1] ?? found[0] ?? "test-platform";
  console.log(`\nОтримувачі для рахунків: виконавець=${performer}, платформа=${platform}`);
  if (!found.length && !process.env.MONO_RECEIVER_PERFORMER) {
    console.log("Список отримувачів порожній або іншої форми: підставив умовні id, очікуйте помилки. Дізнайтеся splitReceiverId і задайте MONO_RECEIVER_PERFORMER / MONO_RECEIVER_PLATFORM.");
  }

  const created: { label: string; invoiceId?: string; pageUrl?: string; status: number; note: string }[] = [];
  for (const variant of variants(performer, platform)) {
    const entry = await call(variant.label, "POST", "/api/merchant/invoice/create", variant.body);
    show(entry);
    const response = (entry.response ?? {}) as { invoiceId?: string; pageUrl?: string; errText?: string; errCode?: string };
    const note = entry.status === 200 ? "створено" : (response.errText ?? response.errCode ?? JSON.stringify(entry.response)).toString().slice(0, 120);
    created.push({ label: variant.label, invoiceId: response.invoiceId, pageUrl: response.pageUrl, status: entry.status, note });
    if (entry.status === 200 && response.invoiceId) {
      show(await call(`Статус після створення (${variant.label.slice(0, 1)})`, "GET", `/api/merchant/invoice/status?invoiceId=${response.invoiceId}`));
    }
  }

  console.log("\n══ ПІДСУМОК ══");
  for (const row of created) console.log(`${row.status === 200 ? "✓" : "✗"} ${row.label}  →  ${row.status}  ${row.invoiceId ?? row.note}`);

  const target = created.find((row) => row.label.startsWith("C.") && row.invoiceId) ?? created.find((row) => row.invoiceId);
  if (target?.invoiceId) {
    console.log(`
Далі вручну, на рахунку «${target.label}»:
 1. Відкрийте ${target.pageUrl} і оплатіть тестовою карткою ${TEST_CARD}, будь-які дата й CVV.
 2. npm run mono:probe -- status ${target.invoiceId}        (очікуємо hold)
 3. npm run mono:probe -- finalize ${target.invoiceId}      (повна сума) і ще раз status
 4. npm run mono:probe -- cancel ${target.invoiceId} 1000   (часткове повернення 10 грн) і status
Дивимось: чи працює finalize для рахунку з розщепленням, як змінюється відповідь (частки, комісії), що показує cancel.`);
  } else {
    console.log("\nЖоден рахунок не створено. Відповіді вище покажуть, чого бракує (отримувачі, MX-термінал, поле корзини).");
  }
  save();
};

const [command = "probe", id, amountArg] = process.argv.slice(2);

const main = async () => {
  if (!TOKEN) fail("Задайте MONO_TEST_TOKEN (тестовий токен з https://api.monobank.ua/).");
  if (command === "probe") return probe();
  if (!id) fail(`Команді «${command}» потрібен invoiceId.`);
  const amount = amountArg ? Number(amountArg) : undefined;
  if (amountArg && (!Number.isInteger(amount) || (amount as number) <= 0)) fail("Сума має бути цілим числом копійок.");
  if (command === "status") show(await call("Статус рахунку", "GET", `/api/merchant/invoice/status?invoiceId=${id}`));
  else if (command === "finalize") show(await call("Фіналізація холду", "POST", "/api/merchant/invoice/finalize", { invoiceId: id, ...(amount ? { amount } : {}) }));
  else if (command === "cancel") show(await call("Скасування оплати", "POST", "/api/merchant/invoice/cancel", { invoiceId: id, ...(amount ? { amount } : {}) }));
  else if (command === "remove") show(await call("Інвалідація рахунку", "POST", "/api/merchant/invoice/remove", { invoiceId: id }));
  else fail(`Невідома команда «${command}». Є: probe, status, finalize, cancel, remove.`);
  save();
};

main().catch((error) => fail(`Збій скрипта: ${error instanceof Error ? error.message : String(error)}`));
