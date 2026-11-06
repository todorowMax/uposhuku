// components/requisites/saved-methods.tsx
//
// Збережені способи оплати для перегляду: банк маскою, решта значенням, яке виконавець ввів сам.

import type { ReactNode } from "react";
import { METHOD_LABEL, paymentMethods, type Requisites } from "@/lib/deals/requisites";

const valueOf = (requisites: Requisites, mask: string | null): Record<string, string | undefined> => ({
  bank: mask ?? undefined,
  usdt: requisites.usdtTrc20,
  wallet: requisites.walletAddress,
  binance: requisites.binanceId,
  paypal: requisites.paypalUrl,
  wise: requisites.wiseUrl,
});

const ZONES: { title: string; methods: readonly string[] }[] = [
  { title: "Банк", methods: ["bank"] },
  { title: "Крипта", methods: ["usdt", "wallet", "binance"] },
  { title: "Закордонні сервіси", methods: ["paypal", "wise"] },
];

/**
 * Збережені способи по зонах, як у формі. У зону «Крипта» можна вкласти `crypto`: підтвердження гаманця стоїть
 * там, а не окремим блоком під формою. Зона з одним лише `crypto` теж показується.
 */
export const SavedMethods = ({ requisites, mask, crypto }: { requisites: Requisites; mask: string | null; crypto?: ReactNode }) => {
  const values = valueOf(requisites, mask);
  const saved: string[] = paymentMethods(requisites);
  return (
    <div className="grid gap-3">
      {ZONES.map((zone) => {
        const methods = zone.methods.filter((method) => saved.includes(method));
        const extra = zone.title === "Крипта" ? crypto : null;
        if (!methods.length && !extra) return null;
        return (
          <section key={zone.title} aria-label={zone.title} className="grid gap-1.5">
            <h3 className="text-sm font-semibold text-ink">{zone.title}</h3>
            <dl>
              {methods.map((method) => (
                <div key={method} className="mt-1.5 first:mt-0">
                  <dt className="text-ink-muted">{METHOD_LABEL[method as keyof typeof METHOD_LABEL]}</dt>
                  <dd className="break-all font-medium tabular-nums text-ink">{values[method]}</dd>
                </div>
              ))}
            </dl>
            {extra}
          </section>
        );
      })}
    </div>
  );
};
