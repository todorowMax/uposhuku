"use client";

// components/deals/method-panels.tsx
//
// Панелі способів оплати в картці прямого переказу: банк (реквізити, QR, посилання), USDT, гаманець, Binance ID,
// PayPal і Wise. Показується одна панель, яку вибрав замовник.

import { WalletPaySection } from "@/components/wallet/wallet-pay-section";
import { Button } from "@/components/ui/button";
import { loadDeals } from "@/lib/deals/client";
import { bankOf, METHOD_LABEL, type PaymentMethod, type Requisites } from "@/lib/deals/requisites";
import { groupIban, requisitesText } from "@/lib/deals/transfer";
import { CopyRow } from "./copy-row";
import { BinancePanel, UsdtPanel } from "./crypto-transfer";
import { QrImage } from "./qr-image";
import type { useTransferCard } from "./use-transfer-card";

const PRICE = new Intl.NumberFormat("uk-UA");

type Card = ReturnType<typeof useTransferCard>;

export namespace MethodPanelTypes {
  export type Props = {
    method: PaymentMethod;
    requisites: Requisites;
    card: Card;
    dealId: string;
    requestId: string;
    stageId: string;
    amount: number;
  };
}

const BankPanel = ({ requisites, card, amount }: { requisites: Requisites; card: Card; amount: number }) => {
  const bank = bankOf(requisites);
  if (!bank) return null;
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2 text-xs leading-snug">
        <CopyRow label="Одержувач" value={bank.recipient} copied={card.copied === "recipient"} onCopy={() => void card.copy("recipient", bank.recipient)} />
        <CopyRow label="IBAN" value={bank.iban} shown={groupIban(bank.iban)} copied={card.copied === "iban"} onCopy={() => void card.copy("iban", bank.iban)} />
        <CopyRow label="Код РНОКПП / ЄДРПОУ" value={bank.taxCode} copied={card.copied === "code"} onCopy={() => void card.copy("code", bank.taxCode)} />
        <CopyRow label="Сума" value={String(amount)} shown={`${PRICE.format(amount)} ₴`} copied={card.copied === "amount"} onCopy={() => void card.copy("amount", amount.toFixed(2))} />
        <CopyRow label="Призначення" value={card.purpose} copied={card.copied === "purpose"} onCopy={() => void card.copy("purpose", card.purpose)} />
      </dl>
      <Button variant="secondary" onClick={() => void card.copy("all", requisitesText(bank, amount, card.purpose))} className="w-auto">
        {card.copied === "all" ? "Скопійовано" : "Копіювати всі реквізити"}
      </Button>
      {bank.payUrl && (
        <a href={bank.payUrl} target="_blank" rel="noopener noreferrer" className="auth-link text-xs">
          Відкрити сторінку оплати в банку
        </a>
      )}
      {card.qrLink && <QrImage value={card.qrLink} label={`QR-код для переказу ${PRICE.format(amount)} гривень`} />}
      <p className="pe-hint">Банк може обмежити суму переказів на місяць: перевірте свій ліміт заздалегідь.</p>
    </div>
  );
};

const LinkPanel = ({ method, url }: { method: "paypal" | "wise"; url: string }) => (
  <div className="grid gap-3">
    <a href={url} target="_blank" rel="noopener noreferrer" className="auth-secondary w-auto">
      Відкрити {METHOD_LABEL[method]}
    </a>
    <p className="pe-hint">Суму у валюті сторін узгодьте в чаті. Переказ проводить {METHOD_LABEL[method]}, а не наш сайт: ми його не бачимо, тож після оплати натисніть «Я оплатив(ла)».</p>
  </div>
);

export const MethodPanel = ({ method, requisites, card, dealId, requestId, stageId, amount }: MethodPanelTypes.Props) => {
  switch (method) {
    case "bank":
      return <BankPanel requisites={requisites} card={card} amount={amount} />;
    case "usdt":
      return requisites.usdtTrc20 ? <UsdtPanel dealId={dealId} requestId={requestId} address={requisites.usdtTrc20} copied={card.copied} onCopy={(key, text) => void card.copy(key, text)} /> : null;
    case "wallet":
      return requisites.walletAddress ? <WalletPaySection dealId={dealId} stageId={stageId} recipient={requisites.walletAddress} onPaid={() => void loadDeals(requestId)} /> : null;
    case "binance":
      return requisites.binanceId ? <BinancePanel binanceId={requisites.binanceId} copied={card.copied} onCopy={(key, text) => void card.copy(key, text)} /> : null;
    case "paypal":
      return requisites.paypalUrl ? <LinkPanel method="paypal" url={requisites.paypalUrl} /> : null;
    case "wise":
      return requisites.wiseUrl ? <LinkPanel method="wise" url={requisites.wiseUrl} /> : null;
  }
};
