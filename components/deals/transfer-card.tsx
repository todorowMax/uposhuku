"use client";

// components/deals/transfer-card.tsx
//
// Картка прямого переказу в угоді: одержувач, IBAN, код, сума, призначення з номером угоди, копіювання,
// посилання на оплату й QR. Реквізити беремо зі знімка угоди (lib/server/requisites-repo). Немає реквізитів:
// спокійний стан «виконавець ще не вказав». Далі «Я оплатив(ла)».

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { groupIban, requisitesText } from "@/lib/deals/transfer";
import { CopyRow } from "./copy-row";
import { CryptoTransfer } from "./crypto-transfer";
import { QrImage } from "./qr-image";
import { useTransferCard } from "./use-transfer-card";

const PRICE = new Intl.NumberFormat("uk-UA");

export const TransferCard = ({
  dealId,
  requestId,
  dealNumber,
  amount,
  busy,
  onClaim,
}: {
  dealId: string;
  requestId: string;
  dealNumber: string;
  amount: number;
  busy: boolean;
  onClaim: () => Promise<boolean>;
}) => {
  const card = useTransferCard(dealId, dealNumber, amount);
  const { state } = card;

  return (
    <div className="deal-box">
      <p className="text-sm font-semibold text-ink">Прямий переказ</p>

      {state.kind === "loading" && (
        <p role="status" className="pe-hint mt-2 flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Завантажуємо реквізити…
        </p>
      )}

      {state.kind === "error" && (
        <div className="mt-2 grid gap-2">
          <p role="alert" className="auth-error">
            {state.message}
          </p>
          <Button variant="secondary" onClick={() => void card.reload()} className="w-auto">
            Спробувати ще раз
          </Button>
        </div>
      )}

      {state.kind === "missing" && (
        <div className="mt-2 grid gap-2">
          <p className="pe-hint">Виконавець ще не вказав реквізити для переказу. Домовтеся з ним у чаті: щойно він їх додасть, вони з&apos;являться тут.</p>
          <dl className="text-xs leading-snug">
            <dt className="text-ink-muted">Сума</dt>
            <dd className="font-semibold tabular-nums text-ink">{PRICE.format(amount)} ₴</dd>
            <dt className="mt-1.5 text-ink-muted">Призначення</dt>
            <dd className="text-ink">{card.purpose}</dd>
          </dl>
          <Button variant="secondary" onClick={() => void card.reload()} className="w-auto">
            Перевірити ще раз
          </Button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="mt-2 grid gap-3">
          <dl className="grid gap-2 text-xs leading-snug">
            <CopyRow label="Одержувач" value={state.requisites.recipient} copied={card.copied === "recipient"} onCopy={() => void card.copy("recipient", state.requisites.recipient)} />
            <CopyRow label="IBAN" value={state.requisites.iban} shown={groupIban(state.requisites.iban)} copied={card.copied === "iban"} onCopy={() => void card.copy("iban", state.requisites.iban)} />
            <CopyRow label="Код РНОКПП / ЄДРПОУ" value={state.requisites.taxCode} copied={card.copied === "code"} onCopy={() => void card.copy("code", state.requisites.taxCode)} />
            <CopyRow label="Сума" value={String(amount)} shown={`${PRICE.format(amount)} ₴`} copied={card.copied === "amount"} onCopy={() => void card.copy("amount", amount.toFixed(2))} />
            <CopyRow label="Призначення" value={card.purpose} copied={card.copied === "purpose"} onCopy={() => void card.copy("purpose", card.purpose)} />
          </dl>
          <Button variant="secondary" onClick={() => void card.copy("all", requisitesText(state.requisites, amount, card.purpose))} className="w-auto">
            {card.copied === "all" ? "Скопійовано" : "Копіювати всі реквізити"}
          </Button>
          {card.copyError && (
            <p role="alert" className="auth-error">
              {card.copyError}
            </p>
          )}
          <span role="status" className="sr-only">
            {card.copied ? "Скопійовано" : ""}
          </span>

          {state.requisites.payUrl && (
            <a href={state.requisites.payUrl} target="_blank" rel="noopener noreferrer" className="auth-link text-xs">
              Відкрити сторінку оплати в банку
            </a>
          )}

          {card.qrLink && (
            <QrImage value={card.qrLink} label={`QR-код для переказу ${PRICE.format(amount)} гривень`} />
          )}

          {state.crypto && (state.requisites.usdtTrc20 || state.requisites.binanceId) && (
            <CryptoTransfer dealId={dealId} requestId={requestId} requisites={state.requisites} copied={card.copied} onCopy={(key, text) => void card.copy(key, text)} />
          )}
        </div>
      )}

      <p className="pe-hint mt-3">
        Банк може обмежити суму переказів на місяць: перевірте свій ліміт заздалегідь. Платформа не отримує ці гроші й не повертає їх. Реквізити зафіксовано на момент прийняття угоди.
      </p>
      <Button variant="offer" disabled={busy} onClick={() => void onClaim()} className="mt-3 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}Я оплатив(ла)
      </Button>
    </div>
  );
};
