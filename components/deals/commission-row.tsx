"use client";

// components/deals/commission-row.tsx
//
// Рядок «Комісія, 7%» у розбивці оплати безпечної угоди з кнопкою «?»: що входить у комісію. Підказка відкривається
// дотиком і клавіатурою (Popover на Radix), а не наведенням.

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMMISSION_RATE } from "@/lib/deals/price";

export const COMMISSION_LABEL = `Комісія, ${Math.round(COMMISSION_RATE * 100)}%`;

export const CommissionRow = ({ amount }: { amount: string }) => (
  <div>
    <dt className="flex items-center gap-1.5">
      {COMMISSION_LABEL}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="icon" aria-label="Що входить у комісію">
            ?
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-w-64 text-sm">Сервіс 5%, банк до 2%. Виконавець отримує ціну повністю.</PopoverContent>
      </Popover>
    </dt>
    <dd className="tabular-nums">{amount}</dd>
  </div>
);
