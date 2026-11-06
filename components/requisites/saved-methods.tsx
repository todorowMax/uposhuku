// components/requisites/saved-methods.tsx
//
// Збережені способи оплати для перегляду: банк маскою, решта значенням, яке виконавець ввів сам.

import { METHOD_LABEL, paymentMethods, type Requisites } from "@/lib/deals/requisites";

const valueOf = (requisites: Requisites, mask: string | null): Record<string, string | undefined> => ({
  bank: mask ?? undefined,
  usdt: requisites.usdtTrc20,
  wallet: requisites.walletAddress,
  binance: requisites.binanceId,
  paypal: requisites.paypalUrl,
  wise: requisites.wiseUrl,
});

export const SavedMethods = ({ requisites, mask }: { requisites: Requisites; mask: string | null }) => {
  const values = valueOf(requisites, mask);
  return (
    <>
      {paymentMethods(requisites).map((method) => (
        <div key={method} className="mt-1.5 first:mt-0">
          <dt className="text-ink-muted">{METHOD_LABEL[method]}</dt>
          <dd className="break-all font-medium tabular-nums text-ink">{values[method]}</dd>
        </div>
      ))}
    </>
  );
};
