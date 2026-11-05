"use client";

// components/deals/crypto-transfer.tsx
//
// Оплата USDT (TRC-20) в картці переказу: QR адреси, повна адреса, підказка звірити початок і кінець, поле хеша.
// Binance ID перевірити неможливо: для нього лише копіювання й звичайне «Я оплатив(ла)». Показується, коли
// ввімкнено прапорець crypto_proof і виконавець вказав адресу чи Binance ID.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { Requisites } from "@/lib/deals/requisites";
import { CopyRow } from "./copy-row";
import { QrImage } from "./qr-image";
import { useCryptoTransfer } from "./use-crypto-transfer";

export const CryptoTransfer = ({
  dealId,
  requestId,
  requisites,
  copied,
  onCopy,
}: {
  dealId: string;
  requestId: string;
  requisites: Pick<Requisites, "usdtTrc20" | "binanceId">;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) => {
  const proof = useCryptoTransfer(dealId, requestId);
  const address = requisites.usdtTrc20;
  return (
    <div className="grid gap-3 border-t border-line pt-3">
      <p className="text-sm font-semibold text-ink">Оплата USDT</p>
      {address && (
        <>
          <dl className="grid gap-2 text-xs leading-snug">
            <CopyRow label="Адреса USDT (TRC-20)" value={address} copied={copied === "usdt"} onCopy={() => onCopy("usdt", address)} />
          </dl>
          <p className="pe-hint">
            Лише мережа TRON (TRC-20). Звірте початок <b className="tabular-nums">{address.slice(0, 6)}</b> і кінець <b className="tabular-nums">{address.slice(-6)}</b> адреси в гаманці перед підтвердженням: переказ в іншу мережу не повернути.
          </p>
          <QrImage value={address} label="QR-код адреси USDT у мережі TRON" />
          <Field label="Хеш транзакції" htmlFor={`crypto-hash-${dealId}`} hint="Після переказу вставте хеш: ми перевіримо оплату в мережі.">
            <Input id={`crypto-hash-${dealId}`} autoComplete="off" spellCheck={false} value={proof.hash} maxLength={70} className="tabular-nums" onChange={(event) => proof.setHash(event.target.value)} />
          </Field>
          {proof.error && (
            <p role="alert" className="auth-error">
              {proof.error}
            </p>
          )}
          <Button disabled={!proof.ready || proof.busy} onClick={() => void proof.submit()} className="w-auto">
            {proof.busy && <Loader2 className="size-4 animate-spin" />}
            Перевірити транзакцію
          </Button>
        </>
      )}
      {requisites.binanceId && (
        <>
          <dl className="grid gap-2 text-xs leading-snug">
            <CopyRow label="Binance ID" value={requisites.binanceId} copied={copied === "binance"} onCopy={() => onCopy("binance", requisites.binanceId!)} />
          </dl>
          <p className="pe-hint">Оплату на Binance ID сайт перевірити не може. Після переказу натисніть «Я оплатив(ла)», виконавець підтвердить отримання.</p>
        </>
      )}
    </div>
  );
};
