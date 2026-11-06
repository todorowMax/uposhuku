"use client";

// components/reviews/verified-badge.tsx
//
// Позначка «Перевірена угода» у відгуку й кнопка «?»: що вона означає. Підказка відкривається дотиком і
// клавіатурою (Popover на Radix). Текст чесно каже, чого позначка не гарантує.

import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const VERIFIED_LABEL = "Перевірена угода";

export const VerifiedBadge = () => (
  <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
    <BadgeCheck className="size-3.5" aria-hidden="true" />
    {VERIFIED_LABEL}
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="icon" aria-label="Що означає «Перевірена угода»">
          ?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-64 text-sm">
        Оплату всіх етапів підтвердив банк (безпечна угода) або блокчейн (ескроу чи USDT за хешем). Переказ на IBAN, Binance, PayPal чи Wise сайт не бачить, тому такі відгуки без позначки.
      </PopoverContent>
    </Popover>
  </span>
);
