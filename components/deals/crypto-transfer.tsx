"use client";

// components/deals/crypto-transfer.tsx
//
// Панелі крипто-способів у картці переказу. USDT (TRC-20): QR адреси, повна адреса, підказка звірити початок і
// кінець, хеш у шторці. Binance ID перевірити неможливо: лише копіювання й звичайне «Я оплатив(ла)».

import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CopyRow } from "./copy-row";
import { QrImage } from "./qr-image";
import { useCryptoTransfer } from "./use-crypto-transfer";

export const UsdtPanel = ({ dealId, requestId, address, copied, onCopy }: { dealId: string; requestId: string; address: string; copied: string | null; onCopy: (key: string, text: string) => void }) => {
  const proof = useCryptoTransfer(dealId, requestId);
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2 text-xs leading-snug">
        <CopyRow label="Адреса USDT (TRC-20)" value={address} copied={copied === "usdt"} onCopy={() => onCopy("usdt", address)} />
      </dl>
      <p className="pe-hint">
        Лише мережа TRON (TRC-20). Звірте початок <b className="tabular-nums">{address.slice(0, 6)}</b> і кінець <b className="tabular-nums">{address.slice(-6)}</b> адреси в гаманці перед підтвердженням: переказ в іншу мережу не повернути.
      </p>
      <QrImage value={address} label="QR-код адреси USDT у мережі TRON" />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="secondary" className="w-auto">
            Вставити хеш транзакції
          </Button>
        </SheetTrigger>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="ui-sheet-title">Хеш транзакції</SheetTitle>
          <SheetBody className="grid gap-3">
            <Field label="Хеш транзакції" htmlFor={`crypto-hash-${dealId}`} hint="Після переказу вставте хеш: ми перевіримо оплату в мережі.">
              <Input id={`crypto-hash-${dealId}`} autoComplete="off" spellCheck={false} value={proof.hash} maxLength={70} className="tabular-nums" onChange={(event) => proof.setHash(event.target.value)} />
            </Field>
            {proof.error && (
              <p role="alert" className="auth-error">
                {proof.error}
              </p>
            )}
            <Button variant="offer" disabled={!proof.ready || proof.busy} onClick={() => void proof.submit()} className="w-full">
              {proof.busy && <Loader2 className="size-4 animate-spin" />}
              Перевірити транзакцію
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export const BinancePanel = ({ binanceId, copied, onCopy }: { binanceId: string; copied: string | null; onCopy: (key: string, text: string) => void }) => (
  <div className="grid gap-3">
    <dl className="grid gap-2 text-xs leading-snug">
      <CopyRow label="Binance ID" value={binanceId} copied={copied === "binance"} onCopy={() => onCopy("binance", binanceId)} />
    </dl>
    <p className="pe-hint">Оплату на Binance ID сайт перевірити не може. Після переказу натисніть «Я оплатив(ла)», виконавець підтвердить отримання.</p>
  </div>
);
