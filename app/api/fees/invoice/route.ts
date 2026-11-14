// POST /api/fees/invoice {amountKop?} — рахунок Monobank на оплату комісії за фактом. Без суми беремо весь борг;
// з сумою: від 100 ₴ і не більше за борг. Оплату в журнал пише лише вебхук з підписом (/api/monobank/webhook)
// або звірка (/api/fees/invoices/[id]) після success.

import { problem, readJson } from "@/lib/api/problem";
import { MIN_FEE_PAYMENT_KOP } from "@/lib/fees/fees";
import { createInvoice, MonobankError } from "@/lib/monobank/client";
import { getSessionUser } from "@/lib/server/auth";
import { readVar } from "@/lib/server/env";
import { createFeeInvoice, feeAccount, newFeeInvoiceId } from "@/lib/server/fee-repo";
import { legalGate } from "@/lib/server/legal-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { logServer } from "@/lib/telemetry/log";

const kopText = (kop: number) => `${(kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;

/** Сума до оплати або текст відмови. */
const pickAmount = (requested: unknown, debtKop: number): number | string => {
  if (debtKop <= 0) return "Боргу немає: платити нічого.";
  if (requested === undefined || requested === null) return debtKop;
  if (typeof requested !== "number" || !Number.isInteger(requested)) return "Сума має бути цілим числом копійок.";
  if (requested > debtKop) return `Сума більша за борг: до сплати ${kopText(debtKop)}.`;
  if (requested < MIN_FEE_PAYMENT_KOP && requested !== debtKop) return `Мінімальна оплата ${kopText(MIN_FEE_PAYMENT_KOP)}, або весь борг ${kopText(debtKop)}.`;
  return requested;
};

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("feeInvoice", user.id);
  if (limited) return limited;
  const legal = await legalGate(user.id);
  if (legal) return legal;
  const body = await readJson(request);
  const amountKop = pickAmount(body?.amountKop, (await feeAccount(user.id, Date.now())).balanceKop);
  if (typeof amountKop === "string") return problem(400, "Сума не підходить", amountKop);
  if (!readVar("MONOBANK_TOKEN")) return problem(503, "Оплата тимчасово недоступна", "Оплата тимчасово недоступна. Спробуйте трохи згодом.");

  const origin = new URL(request.url).origin;
  const id = newFeeInvoiceId();
  try {
    const invoice = await createInvoice({
      amount: amountKop,
      hold: false,
      reference: id,
      destination: "Комісія платформи Findlyfy",
      webHookUrl: `${origin}/api/monobank/webhook`,
      redirectUrl: `${origin}/?fees=paid&invoice=${id}`,
      basketOrder: [{ name: "Комісія платформи Findlyfy", qty: 1, sum: amountKop, code: "platform_fee" }],
    });
    await createFeeInvoice({ id, userId: user.id, amountKop, invoiceId: invoice.invoiceId });
    return Response.json({ id, pageUrl: invoice.pageUrl }, { status: 201 });
  } catch (error) {
    if (!(error instanceof MonobankError)) throw error;
    // Текст банку лише в журнал: людині він нічого не скаже.
    logServer({ level: "error", event: "fee_invoice_failed", message: error.message, detail: { status: error.status, code: error.code }, request });
    return problem(502, "Банк не відповів", "Банк не відповів. Гроші не списано, спробуйте ще раз за хвилину.");
  }
};
