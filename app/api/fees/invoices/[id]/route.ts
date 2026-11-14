// /api/fees/invoices/[id] — стан рахунку за комісію (лише власник). Вебхук може запізнитися або не дійти до
// localhost, тож поки статус не фінальний, звіряємо його з банком і застосовуємо так само, як вебхук.

import { problem } from "@/lib/api/problem";
import { getInvoiceStatus, MonobankError } from "@/lib/monobank/client";
import { getSessionUser } from "@/lib/server/auth";
import { applyFeeInvoiceStatus, feeAccount, getFeeInvoice } from "@/lib/server/fee-repo";
import { FINAL_STATUSES } from "@/lib/server/placement-invoice-repo";
import { logServer } from "@/lib/telemetry/log";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const { id } = await params;
  let invoice = await getFeeInvoice(id, user.id);
  if (!invoice) return problem(404, "Рахунок не знайдено");

  if (!FINAL_STATUSES.includes(invoice.status)) {
    try {
      await applyFeeInvoiceStatus(await getInvoiceStatus(invoice.invoiceId));
      invoice = (await getFeeInvoice(id, user.id)) ?? invoice;
    } catch (error) {
      if (!(error instanceof MonobankError)) throw error;
      // Банк не відповів: віддаємо збережений статус, клієнт спитає ще раз.
      logServer({ level: "warn", event: "fee_invoice_check_failed", message: error.message, detail: { status: error.status, code: error.code }, request });
    }
  }
  const account = await feeAccount(user.id);
  return Response.json({ status: invoice.status, balanceKop: account.balanceKop }, { headers: { "cache-control": "no-store" } });
};
