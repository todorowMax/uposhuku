// lib/server/monobank-events.ts
//
// Розбір події вебхука Monobank за id рахунку. Вебхук один на всі наші рахунки, тож кожен різновид
// рахунку перевіряє, чи рахунок його: спершу розміщення на карті, потім комісія за фактом, потім етап безпечної угоди.
// Додаючи різновид, дописуйте гілку тут.

import type { InvoiceStatusResponse } from "@/lib/monobank/client";
import { reconcilePayment } from "./deal-money";
import { announcePlacementPaid } from "./placement-paid";
import { applyFeeInvoiceStatus } from "./fee-repo";
import { applyInvoiceStatus } from "./placement-invoice-repo";
import { adoptInvoice, findPaymentByInvoice, findPaymentByReference, getPayment } from "./payment-repo";

/**
 * Рахунок етапу безпечної угоди. Тіло вебхука стан не задає: воно лише каже «дивись сюди», а стан
 * береться з відповіді банку на запит статусу. Подія, старіша за вже прийняту, відкидається без запиту.
 * Не знайшли за id рахунку (відповідь про створення загубилась), шукаємо за `reference` і вписуємо id.
 */
const handleDealInvoice = async (status: InvoiceStatusResponse): Promise<boolean> => {
  let payment = await findPaymentByInvoice("monobank", status.invoiceId);
  if (!payment && status.reference) {
    const orphan = await findPaymentByReference(status.reference);
    if (orphan) {
      await adoptInvoice(orphan.id, status.invoiceId);
      payment = await getPayment(orphan.id);
    }
  }
  if (!payment) return false;
  if (payment.modifiedDate !== null && status.modifiedDate < payment.modifiedDate) return true;
  await reconcilePayment(payment);
  return true;
};

/** true, якщо рахунок чийсь із наших і подію застосовано; false, якщо рахунок невідомий. */
export const handleInvoiceStatus = async (status: InvoiceStatusResponse): Promise<boolean> => {
  const applied = await applyInvoiceStatus(status);
  if (applied) {
    if (applied.credited) await announcePlacementPaid(applied.userId, applied.amount, "/api/monobank/webhook");
    return true;
  }
  // Рахунок комісії за фактом (fee_invoices): оплату в журнал пише лише success. Стоїть перед угодою: рахунок
  // комісії в `deal_payments` не лежить, і гілка угоди його б просто не знайшла.
  if (await applyFeeInvoiceStatus(status)) return true;
  return handleDealInvoice(status);
};
