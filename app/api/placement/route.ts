// /api/placement — розміщення на карті поточної людини.
// GET — скільки сплачено, рівень, історія; POST {amount} — створити рахунок у Monobank
// і повернути посилання на оплату. Рівень змінює лише вебхук з підписом ECDSA
// (/api/monobank/webhook) або звірка статусу (/api/placement/invoices/[id]).

import { problem, readJson } from "@/lib/api/problem";
import { createInvoice, MonobankError } from "@/lib/monobank/client";
import { MAX_PAYMENT, MIN_PAYMENT } from "@/lib/placement/tiers";
import { getSessionUser } from "@/lib/server/auth";
import { legalGate } from "@/lib/server/legal-gate";
import { readVar } from "@/lib/server/env";
import { createPlacementInvoice, newPlacementInvoiceId } from "@/lib/server/placement-invoice-repo";
import { getPlacement } from "@/lib/server/placement-repo";
import { logServer } from "@/lib/telemetry/log";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ placement: await getPlacement(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const legal = await legalGate(user.id);
  if (legal) return legal;
  const body = await readJson(request);
  const amount = typeof body?.amount === "number" ? Math.round(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < MIN_PAYMENT || amount > MAX_PAYMENT) {
    return problem(400, "Сума не підходить", `Сума від ${MIN_PAYMENT} до ${MAX_PAYMENT} ₴.`);
  }
  if (!readVar("MONOBANK_TOKEN")) return problem(503, "Оплата тимчасово недоступна", "Оплата тимчасово недоступна. Спробуйте трохи згодом.");

  const origin = new URL(request.url).origin;
  const id = newPlacementInvoiceId();
  const sum = amount * 100;
  try {
    const invoice = await createInvoice({
      amount: sum,
      hold: false,
      reference: id,
      destination: "Розміщення на карті Findlyfy",
      webHookUrl: `${origin}/api/monobank/webhook`,
      redirectUrl: `${origin}/?placement=${id}`,
      basketOrder: [{ name: `Розміщення на карті Findlyfy, ${amount} ₴`, qty: 1, sum, code: "placement" }],
    });
    await createPlacementInvoice({ id, userId: user.id, amount, invoiceId: invoice.invoiceId });
    return Response.json({ id, pageUrl: invoice.pageUrl }, { status: 201 });
  } catch (error) {
    if (!(error instanceof MonobankError)) throw error;
    // Текст банку лише в журнал: людині він нічого не скаже.
    logServer({ level: "error", event: "placement_invoice_failed", message: error.message, detail: { status: error.status, code: error.code }, request });
    return problem(502, "Банк не відповів", "Банк не відповів. Гроші не списано, спробуйте ще раз за хвилину.");
  }
}
