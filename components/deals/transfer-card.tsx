"use client";

// components/deals/transfer-card.tsx
//
// Картка прямого переказу в угоді. Способи оплати (банк, USDT, гаманець, Binance ID, PayPal, Wise) беремо зі
// знімка угоди (lib/server/requisites-repo): кілька способів це вкладки, один спосіб без перемикача. Немає
// жодного: спокійний стан «виконавець ще не вказав». Далі «Я оплатив(ла)» із вибраним способом.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPaymentMethod, METHOD_LABEL, type PaymentMethod } from "@/lib/deals/requisites";
import { DisputeTips } from "./dispute-tips";
import { MethodPanel } from "./method-panels";
import { useTransferCard } from "./use-transfer-card";

const PRICE = new Intl.NumberFormat("uk-UA");

export const TransferCard = ({
  dealId,
  requestId,
  stageId,
  dealNumber,
  amount,
  busy,
  onClaim,
}: {
  dealId: string;
  requestId: string;
  stageId: string;
  dealNumber: string;
  amount: number;
  busy: boolean;
  onClaim: (via?: PaymentMethod) => Promise<boolean>;
}) => {
  const card = useTransferCard(dealId, dealNumber, amount);
  const { state } = card;

  return (
    <div className="deal-box">
      <p className="text-sm font-semibold text-ink">Прямий переказ</p>

      {state.kind === "loading" && (
        <div role="status" className="pe-hint mt-2 flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Завантажуємо реквізити…
        </div>
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

      {state.kind === "ready" && card.via && (
        <div className="mt-2 grid gap-3">
          {state.methods.length > 1 ? (
            <Tabs value={card.via} onValueChange={(value) => isPaymentMethod(value) && card.setPicked(value)}>
              <TabsList aria-label="Спосіб оплати">
                {state.methods.map((method) => (
                  <TabsTrigger key={method} value={method}>
                    {METHOD_LABEL[method]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {state.methods.map((method) => (
                <TabsContent key={method} value={method}>
                  <MethodPanel method={method} requisites={state.requisites} card={card} dealId={dealId} requestId={requestId} stageId={stageId} amount={amount} />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <MethodPanel method={card.via} requisites={state.requisites} card={card} dealId={dealId} requestId={requestId} stageId={stageId} amount={amount} />
          )}
          {card.copyError && (
            <p role="alert" className="auth-error">
              {card.copyError}
            </p>
          )}
          <span role="status" className="sr-only">
            {card.copied ? "Скопійовано" : ""}
          </span>
        </div>
      )}

      <p className="pe-hint mt-3">Платформа не отримує ці гроші й не повертає їх. Реквізити зафіксовано на момент прийняття угоди.</p>
      <DisputeTips />
      <Button variant="offer" disabled={busy || state.kind === "loading"} onClick={() => void onClaim(card.via ?? undefined)} className="mt-3 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}Я оплатив(ла)
      </Button>
    </div>
  );
};
