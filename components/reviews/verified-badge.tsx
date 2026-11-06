"use client";

// components/reviews/verified-badge.tsx
//
// Позначка «Перевірена угода» у відгуку й кнопка «?»: що вона означає. Підказка відкривається дотиком і
// клавіатурою (шторка на телефоні, поповер на десктопі). Текст чесно каже, чого позначка не гарантує.

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
      Оплату всіх етапів підтвердив банк (безпечна угода) або блокчейн (ескроу чи USDT за хешем). Переказ на IBAN, Binance, PayPal чи Wise сайт не бачить, тому такі відгуки без позначки.
    </ResponsiveHint>
  </span>
);
