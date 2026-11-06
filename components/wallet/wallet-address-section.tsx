"use client";

// components/wallet/wallet-address-section.tsx
//
// Вхід у підтвердження адреси гаманця в кабінеті виконавця. Панель з wagmi завантажується динамічно й лише коли
// людина розгорнула блок: поки цього не зробили, жодного байта wagmi не тягнемо.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { PublicCryptoConfig } from "@/lib/crypto/config";

const Panel = dynamic(() => import("./address-proof-panel"), {
  ssr: false,
  loading: () => (
    <div role="status" className="pe-hint flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" />
      Завантажуємо гаманці…
    </div>
  ),
});

export const WalletAddressSection = ({ config, current, pending, onDone }: { config: PublicCryptoConfig; current: string | undefined; pending: string | undefined; onDone: () => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <p className="font-semibold text-ink">Гаманець для USDT</p>
      <p className="pe-hint">Підтвердьте адресу підписом гаманця: замовник платитиме на неї напряму, а сайт перевірить платіж у мережі. Адреса діє через 24 години після підпису.</p>
      {current && (
        <p className="text-xs text-ink-muted">
          Підтверджена адреса: <span className="break-all font-medium tabular-nums text-ink">{current}</span>
        </p>
      )}
      {pending && pending !== current && (
        <p className="text-xs text-ink-muted">
          Чекає підтвердження 24 години: <span className="break-all font-medium tabular-nums text-ink">{pending}</span>
        </p>
      )}
      {open ? (
        <Panel config={config} onDone={onDone} />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} className="w-auto">
          {current ? "Змінити адресу гаманця" : "Підтвердити адресу гаманця"}
        </Button>
      )}
    </div>
  );
};
