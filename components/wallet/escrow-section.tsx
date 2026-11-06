"use client";

// components/wallet/escrow-section.tsx
//
// Ескроу в картці угоди: що відбувається з етапом і дії сторони. Без wagmi: панель з гаманцем підтягується динамічно
// лише після натискання, тож ні головна, ні карта не тягнуть жодного байта wagmi. Статус етапу показує те, що
// записала звірка зі станом контракту; кнопки не змінюють його самі.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { EscrowRole } from "@/lib/crypto/escrow-ui";
import type { Deal, DealStage } from "@/lib/deals/types";
import { useEscrowInfo } from "./use-escrow-info";

const Panel = dynamic(() => import("./escrow-panel"), {
  ssr: false,
  loading: () => (
    <p role="status" className="pe-hint flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" />
      Завантажуємо гаманці…
    </p>
  ),
});

const HINT: Partial<Record<DealStage["status"], Record<EscrowRole, string>>> = {
  pending: { customer: "Внесіть USDT в ескроу: кошти лежать у контракті, доки ви не приймете роботу.", performer: "Чекаємо, поки замовник внесе кошти в ескроу." },
  funded: { customer: "Кошти в ескроу. Виконавець працює.", performer: "Кошти в ескроу: можна працювати й здати етап." },
  delivered: { customer: "Етап здано: перевірте й прийміть роботу, або відкрийте спір.", performer: "Етап здано. Після строку перевірки ви зможете забрати кошти." },
  disputed: { customer: "Спір відкрито: рішення ухвалить арбітр у блокчейні.", performer: "Спір відкрито: рішення ухвалить арбітр у блокчейні." },
};

export const EscrowSection = ({ deal, stage, side, onChanged }: { deal: Deal; stage: DealStage; side: EscrowRole; onChanged: () => void }) => {
  const { info, error, retry } = useEscrowInfo(deal.id);
  const [open, setOpen] = useState(false);
  const closed = stage.status === "released" || stage.status === "refunded";
  const hint = HINT[stage.status]?.[side];
  return (
    <div className="grid gap-3 border-t border-line pt-3">
      <p className="text-sm font-semibold text-ink">Ескроу USDT · {stage.amount} USDT</p>
      {hint && <p className="pe-hint">{hint}</p>}
      {stage.status === "disputed" && (
        <p className="pe-hint" role="status">
          Рішення арбітра виконується в мережі, після цього статус оновиться сам.
        </p>
      )}
      {error && (
        <div className="grid gap-2">
          <p role="alert" className="auth-error">
            {error}
          </p>
          <Button variant="secondary" onClick={retry} className="w-auto">
            Спробувати ще раз
          </Button>
        </div>
      )}
      {!closed && !error && !info && (
        <p role="status" className="pe-hint flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Завантажуємо дані ескроу…
        </p>
      )}
      {!closed && info &&
        (open ? (
          <Panel deal={deal} stage={stage} side={side} config={info.config} performerWallet={info.performerWallet} onChanged={onChanged} />
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)} className="w-auto">
            Підключити гаманець
          </Button>
        ))}
    </div>
  );
};
