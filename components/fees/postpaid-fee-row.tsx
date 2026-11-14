"use client";

// components/fees/postpaid-fee-row.tsx
//
// Рядок «Комісія платформи 5% · 1 100 ₴» під сумою прямого переказу, коли замовнику нараховується комісія за фактом.
// Кнопка «?» пояснює, коли вона стягується (ResponsiveHint). Рядок стоїть у `dl.deal-summary` форм умов.

import { Button } from "@/components/ui/button";
import { ResponsiveHint } from "@/components/ui/responsive-hint";
import { POSTPAID_FEE_BP } from "@/lib/fees/fees";
import { formFeeAmount, formFeeLabel } from "@/lib/fees/view";

export const PostpaidFeeRow = ({ totalUah }: { totalUah: number }) => (
  <div className="items-center">
    <dt className="flex items-center gap-1.5">
      {formFeeLabel(POSTPAID_FEE_BP)}
      <ResponsiveHint
        title="Про комісію платформи"
        trigger={
          <Button variant="icon" aria-label="Про комісію платформи">
            ?
          </Button>
        }
      >
        Нараховується на ваш рахунок, коли ви позначаєте оплату етапу. Сплатити можна будь-коли, до кінця кварталу плюс 14 днів. Гарантії платформи в прямому переказі немає.
      </ResponsiveHint>
    </dt>
    <dd className="tabular-nums">{formFeeAmount(totalUah, POSTPAID_FEE_BP)}</dd>
  </div>
);
