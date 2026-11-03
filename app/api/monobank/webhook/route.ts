// /api/monobank/webhook — вебхук еквайрингу Monobank, спільний для всіх наших рахунків.
// Тіло читаємо сирим текстом: підпис ECDSA (X-Sign) рахується саме над ним. Невірний підпис
// дає 401 без подробиць. Для вірного відповідаємо 200 завжди (навіть коли рахунок не наш або
// тіло нерозпізнане), інакше банк повторюватиме запит.

import { problem } from "@/lib/api/problem";
import { invoiceStatusResponse } from "@/lib/monobank/client";
import { verifyWebhookSignature } from "@/lib/monobank/webhook";
import { handleInvoiceStatus } from "@/lib/server/monobank-events";
import { logServer } from "@/lib/telemetry/log";

const ok = () => Response.json({ ok: true });

const parseStatus = (rawBody: string) => {
  try {
    return invoiceStatusResponse.safeParse(JSON.parse(rawBody));
  } catch {
    return null;
  }
};

export const POST = async (request: Request) => {
  const rawBody = await request.text();
  const signature = request.headers.get("x-sign");
  if (!signature || !(await verifyWebhookSignature(rawBody, signature))) return problem(401, "Підпис не підійшов");

  const parsed = parseStatus(rawBody);
  if (!parsed?.success) {
    logServer({ level: "warn", event: "monobank_webhook_unreadable", message: "Тіло вебхука з вірним підписом не розібрано", request });
    return ok();
  }
  await handleInvoiceStatus(parsed.data);
  return ok();
};
