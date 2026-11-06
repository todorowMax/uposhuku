"use client";

// components/deals/deal-screen/parts/customer-stage-actions.tsx
//
// Що замовник бачить під активним етапом: оплата (рахунок банку чи прямий переказ), очікування, приймання роботи.
// Головна кнопка кроку («Оплатити», «Прийняти роботу») стоїть унизу екрана; тут пояснення й другорядні дії.

import { Clock, Loader2, ShieldCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CommissionRow } from "@/components/deals/commission-row";
import { DeliveryNote } from "@/components/deals/delivery-note";
import { ReceiptBox } from "@/components/deals/receipt-box";
import { formatKop, quoteStage } from "@/lib/deals/price";
import { HOLD_DAYS, type Deal, type DealStage } from "@/lib/deals/types";
import type { DealScreenState } from "../use-deal-screen";
import { EscrowEntry } from "./escrow-entry";

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const PayExplain = ({ stage }: { stage: DealStage }) => {
  const quote = quoteStage(stage.amount);
  return (
    <div className="deal-box">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Оплата через Monobank</p>
      <dl className="deal-summary mt-2">
        <div>
          <dt>Вартість роботи</dt>
          <dd className="tabular-nums">{formatKop(quote.price)}</dd>
        </div>
        <CommissionRow amount={formatKop(quote.fee)} />
        <div>
          <dt>До оплати</dt>
          <dd className="tabular-nums font-semibold">{formatKop(quote.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-ink">
        Ви перейдете на сторінку банку й заморозите <strong className="tabular-nums">{formatKop(quote.total)}</strong> на вашій картці на {HOLD_DAYS} днів. Гроші не
        списуються, поки ви не підтвердите роботу. Виконавець отримає <span className="tabular-nums">{formatKop(quote.price)}</span> повністю.
      </p>
    </div>
  );
};

const Delivered = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    <DeliveryNote delivery={stage.delivery} />
    {stage.payoutError && (
      <p role="alert" className="auth-error w-full">
        {stage.payoutError}
      </p>
    )}
    {deal.method === "safe" && (
      <Button variant="quiet" disabled={screen.busy === "dispute"} onClick={() => void screen.run("dispute", stage)}>
        Є претензії
      </Button>
    )}
  </div>
);

const Pending = ({ deal, stage }: { deal: Deal; stage: DealStage }) => {
  if (deal.method === "safe") return <PayExplain stage={stage} />;
  return <p className="pe-hint">Оплата прямим переказом: реквізити, спосіб оплати й «Я оплатив(ла)» на екрані оплати. Кнопка «Оплатити» внизу.</p>;
};

const Claimed = ({ deal, stage }: { deal: Deal; stage: DealStage }) => (
  <div className="grid gap-2">
    <div className="deal-note">
      <Loader2 className="size-3.5 animate-spin" />
      Виконавець підтверджує, що гроші дійшли.
    </div>
    <ReceiptBox deal={deal} stage={stage} />
  </div>
);

const holdText = (deal: Deal, stage: DealStage): string => {
  if (deal.method !== "safe" || !stage.holdUntil) return "Оплату підтверджено, виконавець працює.";
  const frozen = stage.payment ? `Заморожено ${formatKop(stage.payment.total)}` : "Кошти заморожено";
  return `${frozen} до ${DATE.format(new Date(stage.holdUntil))}. Виконавець працює.`;
};

const Funded = ({ deal, stage }: { deal: Deal; stage: DealStage }) => (
  <div className="deal-note">
    <Clock className="size-3.5" />
    {holdText(deal, stage)}
  </div>
);

const BankPending = ({ stage }: { stage: DealStage }) => (
  <div className="deal-note" role="status">
    <Loader2 className="size-3.5 animate-spin" />
    {stage.status === "releasing"
      ? "Виплату передано в банк. «Виплачено» з&apos;явиться, щойно банк її підтвердить."
      : "Повернення передано в банк. «Кошти повернено» з&apos;явиться, щойно банк його підтвердить."}
  </div>
);

const Disputed = () => (
  <div className="deal-note deal-note-warn">
    <ShieldCheck className="size-3.5" />
    Спір відкрито. Кошти лишаються замороженими, модератор прочитає чат і зв&apos;яжеться з вами протягом доби.
  </div>
);

export const CustomerStageActions = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  if (deal.method === "escrow") return <EscrowEntry stage={stage} onOpen={() => screen.setEscrowOpen(true)} />;
  switch (stage.status) {
    case "pending":
      return <Pending deal={deal} stage={stage} />;
    case "claimed":
      return <Claimed deal={deal} stage={stage} />;
    case "funded":
      return <Funded deal={deal} stage={stage} />;
    case "delivered":
      return <Delivered deal={deal} stage={stage} screen={screen} />;
    case "releasing":
    case "refunding":
      return <BankPending stage={stage} />;
    case "disputed":
      return <Disputed />;
    default:
      return null;
  }
};
