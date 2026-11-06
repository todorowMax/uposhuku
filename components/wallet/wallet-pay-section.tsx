"use client";

// components/wallet/wallet-pay-section.tsx
//
// Оплата з гаманця в картці прямого переказу. Показується, коли функція ввімкнена цій людині, мережа налаштована і
// виконавець підтвердив адресу. Панель з wagmi завантажується динамічно після натискання.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useCryptoConfig } from "./use-crypto-config";

const Panel = dynamic(() => import("./direct-wallet-pay-panel"), {
  ssr: false,
  loading: () => (
    <div role="status" className="pe-hint flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" />
      Завантажуємо гаманці…
    </div>
  ),
});

export const WalletPaySection = ({ dealId, stageId, recipient, onPaid }: { dealId: string; stageId: string; recipient: string; onPaid: () => void }) => {
  const config = useCryptoConfig();
  const [open, setOpen] = useState(false);
  if (!config) return null;
  return (
    <div className="grid gap-3 border-t border-line pt-3">
      <p className="text-sm font-semibold text-ink">Оплата USDT з гаманця</p>
      {open ? (
        <Panel dealId={dealId} stageId={stageId} recipient={recipient} config={config} onPaid={onPaid} />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} className="w-auto">
          Підключити гаманець
        </Button>
      )}
    </div>
  );
};
