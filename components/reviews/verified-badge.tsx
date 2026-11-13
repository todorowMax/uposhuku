"use client";

// components/reviews/verified-badge.tsx
//
// Позначка «Перевірена угода» у відгуку й кнопка «?»: що вона означає. Підказка відкривається дотиком і
// клавіатурою (шторка на телефоні, поповер на десктопі). Текст збігається з розділом «Перевірена угода» в умовах (lib/legal/terms.ts) і чесно каже, чого позначка не гарантує.

import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveHint } from "@/components/ui/responsive-hint";

export const VERIFIED_LABEL = "Перевірена угода";

export const VerifiedBadge = () => (
  <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
    <BadgeCheck className="size-3.5" aria-hidden="true" />
    {VERIFIED_LABEL}
    <ResponsiveHint
      title="Що означає «Перевірена угода»"
      trigger={
        <Button variant="icon" aria-label="Що означає «Перевірена угода»">
          ?
        </Button>
      }
    >
      Угоду завершено, а оплату кожного етапу підтвердив банк або блокчейн, а не друга сторона. Позначка говорить лише про те, що угода й оплата були. Вона не говорить, що роботу виконано якісно, що виконавець надійний і що текст відгуку правдивий. Для USDT за хешем блокчейн показує переказ на адресу виконавця, а суму угоди сервіс не зіставляє. Переказ на банківський рахунок сайт не бачить, тому такі відгуки без позначки; в рейтингу вони враховуються так само.
    </ResponsiveHint>
  </span>
);
