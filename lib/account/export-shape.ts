// lib/account/export-shape.ts
//
// Форма угод у виписці даних: людина бачить свою сторону, а особисте другої сторони (ім'я, фото, спеціальність, id
// акаунта) замінене міткою. Чиста функція, без бази.

import type { Deal } from "@/lib/deals/types";

export const OTHER_SIDE = "Інша сторона";

export interface ExportDealInput {
  deal: Deal;
  asCustomer: boolean;
}

/** Угода як її бачить власник виписки: виконавця-співрозмовника (коли людина замовник) замінює мітка. */
export const dealsOnlyOwnSide = (items: ExportDealInput[]): (Deal & { role: "customer" | "performer" })[] =>
  items.map(({ deal, asCustomer }) => {
    if (!asCustomer) return { ...deal, role: "performer" };
    return { ...deal, role: "customer", responseId: "", performer: { ...deal.performer, id: "other", name: OTHER_SIDE, photo: undefined, specialty: "" } };
  });
