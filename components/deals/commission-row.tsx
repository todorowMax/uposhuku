"use client";

// components/deals/commission-row.tsx
//
// Рядок «Комісія, 7%» у розбивці оплати безпечної угоди з кнопкою «?»: що входить у комісію. Підказка відкривається
// дотиком і клавіатурою, а не наведенням: шторка на телефоні, поповер на десктопі (ResponsiveHint).

import { Button } from "@/components/ui/button";
import { ResponsiveHint } from "@/components/ui/responsive-hint";
import { COMMISSION_RATE } from "@/lib/deals/price";

export const COMMISSION_LABEL = `Комісія, ${Math.round(COMMISSION_RATE * 100)}%`;

export const CommissionRow = ({ amount }: { amount: string }) => (
  <div className="items-center">
    <dt className="flex items-center gap-1.5">
      {COMMISSION_LABEL}
      <ResponsiveHint
        title="Що входить у комісію"
        trigger={
          <Button variant="icon" aria-label="Що входить у комісію">
            ?
          </Button>
        }
      >
        Сервіс 5%, банк до 2%. Виконавець отримує ціну повністю.
      </ResponsiveHint>
    </dt>
    <dd className="tabular-nums">{amount}</dd>
  </div>
);
