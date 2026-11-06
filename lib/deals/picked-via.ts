// lib/deals/picked-via.ts
//
// Вкладка способу оплати, яку замовник вибрав на екрані оплати: лишається в sessionStorage, щоб після повернення
// з застосунку банку (сторінку могло вивантажити) екран відкрився на тій самій вкладці.

import { isPaymentMethod, type PaymentMethod } from "@/lib/deals/requisites";

const key = (dealId: string) => `uposhuku:pay-via:${dealId}`;

export const readPickedVia = (dealId: string): PaymentMethod | null => {
  try {
    const value = window.sessionStorage.getItem(key(dealId));
    return isPaymentMethod(value) ? value : null;
  } catch {
    return null;
  }
};

export const writePickedVia = (dealId: string, method: PaymentMethod): void => {
  try {
    window.sessionStorage.setItem(key(dealId), method);
  } catch {
    // Сховище недоступне (приватний режим): вкладка просто не збережеться.
  }
};
