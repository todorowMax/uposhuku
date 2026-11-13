"use client";

// «Мої платежі»: що й коли оплачено за розміщення.

import { TIER_NAMES } from "@/lib/placement/tiers";
import type { PlacementFlow } from "@/components/placement/use-placement-flow";

export namespace PlacementHistoryTypes {
  export type Props = { payments: NonNullable<PlacementFlow["placement"]>["payments"] };
}

const PRICE = new Intl.NumberFormat("uk-UA");
const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const PlacementHistory = ({ payments }: PlacementHistoryTypes.Props) => (
  <>
    <ul className="grid gap-1.5">
      {payments.map((payment) => (
        <li key={payment.id} className="place-row">
          <span className="min-w-0">
            <span className="block text-sm font-semibold tabular-nums text-ink">{PRICE.format(payment.amount)} ₴</span>
            <span className="block text-xs text-ink-muted">{DATE.format(new Date(payment.createdAt))}</span>
          </span>
          <span className="text-xs text-ink-muted">
            Рівень {payment.tierAfter}: {TIER_NAMES[payment.tierAfter]}
          </span>
        </li>
      ))}
    </ul>
    <p className="pe-hint">Квитанцію про оплату надсилає monobank.</p>
  </>
);
