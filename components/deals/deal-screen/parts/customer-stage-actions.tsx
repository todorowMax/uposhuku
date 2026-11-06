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
import { ReleaseCodeBox } from "@/components/deals/release-code-box";
import { TransferCard } from "@/components/deals/transfer-card";
import { EscrowSection } from "@/components/wallet/escrow-section";
import { loadDeals } from "@/lib/deals/client";
import { money } from "@/lib/deals/format";
import { releaseNeedsCode } from "@/lib/deals/limits";
import { payoutOf } from "@/lib/deals/machine";
import { formatKop, quoteStage } from "@/lib/deals/price";
import { HOLD_DAYS, type Deal, type DealStage } from "@/lib/deals/types";
import type { DealScreenState } from "../use-deal-screen";

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

const Delivered = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  const safe = deal.method === "safe";
  const { busy } = screen;
  if (screen.confirmRelease && safe && releaseNeedsCode(stage.amount)) {
    return (
      <div className="grid gap-2">
        <DeliveryNote delivery={stage.delivery} />
        <ReleaseCodeBox
          dealId={deal.id}
          amount={money(payoutOf(stage.amount))}
          busy={busy === "release"}
          onConfirm={(code) => screen.run("release", stage, { code })}
          onCancel={() => screen.setConfirmRelease(false)}
        />
      </div>
    );
  }
  if (screen.confirmRelease) {
    return (
      <>
        {/* Результат лишається на екрані, поки людина підтверджує приймання. */}
        <DeliveryNote delivery={stage.delivery} />
        <div className="deal-box">
          <p className="text-sm text-ink">
            {safe ? `Виплатити ${money(payoutOf(stage.amount))} виконавцю?` : "Підтвердити, що роботу прийнято?"} Скасувати це не вийде.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="offer" disabled={busy === "release"} onClick={() => void screen.run("release", stage)} className="flex-1">
              {busy === "release" && <Loader2 className="size-4 animate-spin" />}
              Так, все добре
            </Button>
            <Button variant="quiet" onClick={() => screen.setConfirmRelease(false)}>
              Ні
            </Button>
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <DeliveryNote delivery={stage.delivery} />
      {stage.payoutError && (
        <p role="alert" className="auth-error w-full">
          {stage.payoutError}
        </p>
      )}
      {safe && (
        <Button variant="quiet" disabled={busy === "dispute"} onClick={() => void screen.run("dispute", stage)}>
          Є претензії
        </Button>
      )}
    </div>
  );
};

const Pending = ({ deal, stage, screen }: { deal: Deal; stage: DealStage; screen: DealScreenState.Value }) => {
  if (deal.method === "safe") return <PayExplain stage={stage} />;
  return (
    <>
      <TransferCard
        dealId={deal.id}
        requestId={deal.requestId}
        stageId={stage.id}
        dealNumber={deal.number}
        amount={stage.amount}
        busy={screen.busy === "claim_paid"}
        onClaim={(via) => screen.run("claim_paid", stage, { via })}
      />
      <div className="mt-2">
        <ReceiptBox deal={deal} stage={stage} />
      </div>
    </>
  );
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
  if (deal.method === "escrow") return <EscrowSection deal={deal} stage={stage} side="customer" onChanged={() => void loadDeals(deal.requestId)} />;
  switch (stage.status) {
    case "pending":
      return <Pending deal={deal} stage={stage} screen={screen} />;
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
