// /api/placement/invoices/[id] — стан рахунку за розміщення (лише власник).
// Вебхук до localhost не доходить, а на проді може запізнитися, тож поки статус не
// фінальний, звіряємо його з банком і застосовуємо так само, як вебхук.

import { problem } from "@/lib/api/problem";
import { getInvoiceStatus, MonobankError } from "@/lib/monobank/client";
import { getSessionUser } from "@/lib/server/auth";
import { applyInvoiceStatus, FINAL_STATUSES, getPlacementInvoice } from "@/lib/server/placement-invoice-repo";
import { announcePlacementPaid } from "@/lib/server/placement-paid";
import { getPlacement } from "@/lib/server/placement-repo";
import { logServer } from "@/lib/telemetry/log";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const { id } = await params;
  let invoice = await getPlacementInvoice(id, user.id);
  if (!invoice) return problem(404, "Рахунок не знайдено");

  if (!FINAL_STATUSES.includes(invoice.status)) {
    try {
      const applied = await applyInvoiceStatus(await getInvoiceStatus(invoice.invoiceId));
      if (applied?.credited) await announcePlacementPaid(user.id, applied.amount, "/api/placement/invoices");
      invoice = (await getPlacementInvoice(id, user.id)) ?? invoice;
    } catch (error) {
      if (!(error instanceof MonobankError)) throw error;
      // Банк не відповів: віддаємо збережений статус, клієнт спитає ще раз.
      logServer({ level: "warn", event: "placement_invoice_check_failed", message: error.message, detail: { status: error.status, code: error.code }, request });
    }
  }
  return Response.json({ status: invoice.status, placement: await getPlacement(user.id) }, { headers: { "cache-control": "no-store" } });
};
