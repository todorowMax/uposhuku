"use client";

// components/fees/payment-modes-hint.tsx
//
// «Як це працює»: два способи оплатити угоду. Один текст для форми умов і для екрана «Рахунок»; підказка
// відкривається дотиком і клавіатурою (ResponsiveHint: шторка на телефоні, поповер на десктопі).

import { Button } from "@/components/ui/button";
import { ResponsiveHint } from "@/components/ui/responsive-hint";
import { POSTPAID_FEE_BP } from "@/lib/fees/fees";
import { rateText } from "@/lib/fees/view";

export const PaymentModesHint = () => (
  <ResponsiveHint
    title="Як це працює"
    popoverClassName="max-w-80"
    trigger={
      <Button variant="link" className="w-fit text-xs">
        Як це працює
      </Button>
    }
  >
    <div className="grid gap-3">
      <p>
        <strong>Безпечна угода.</strong> Гроші тримає банк до вашого підтвердження, комісія вже в сумі платежу.
      </p>
      <p>
        <strong>Прямий переказ.</strong> Ви платите виконавцю напряму (картка, IBAN, крипта та інше), гарантії платформи немає. Комісія {rateText(POSTPAID_FEE_BP)} нараховується на ваш рахунок. За неї ви отримуєте підбір виконавців, чат, відгуки й допомогу модератора зі скаргою.
      </p>
    </div>
  </ResponsiveHint>
);
