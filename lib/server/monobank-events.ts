// lib/server/monobank-events.ts
//
// Розбір події вебхука Monobank за id рахунку. Вебхук один на всі наші рахунки, тож кожен
// різновид рахунку (розміщення на карті, а згодом етапи безпечної угоди) перевіряє, чи
// рахунок його, і застосовує статус. Додаючи різновид, дописуйте гілку тут.

import type { InvoiceStatusResponse } from "@/lib/monobank/client";
import { announcePlacementPaid } from "./placement-paid";
import { applyInvoiceStatus } from "./placement-invoice-repo";

/** true, якщо рахунок чийсь із наших і подію застосовано; false, якщо рахунок невідомий. */
export const handleInvoiceStatus = async (status: InvoiceStatusResponse): Promise<boolean> => {
  const applied = await applyInvoiceStatus(status);
  if (!applied) return false;
  if (applied.credited) await announcePlacementPaid(applied.userId, applied.amount, "/api/monobank/webhook");
  return true;
};
