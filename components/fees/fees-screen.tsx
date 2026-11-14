"use client";

// components/fees/fees-screen.tsx
//
// Екран «Рахунок» (меню акаунта): скільки людина винна платформі за комісію з прямих переказів, до якого дня, кнопка
// «Сплатити» і журнал нарахувань та оплат. Логіка в use-fees-screen.ts, модель у docs/tasks/2026-11-14-postpaid-commission.md.

import { Loader2 } from "@/components/icons";
import { PaymentModesHint } from "@/components/fees/payment-modes-hint";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { formatKop } from "@/lib/deals/price";
import type { FeeTypes } from "@/lib/fees/fees.types";
import { dueText, entryDateText, entryFormula, entryTitle, kindLabel, rateText, signedKop } from "@/lib/fees/view";
import { POSTPAID_FEE_BP } from "@/lib/fees/fees";
import { cn } from "@/lib/utils";
import type { FeesReturnState } from "./use-fees-return";
import { useFeesScreen } from "./use-fees-screen";

const RETURN_TEXT: Record<Exclude<FeesReturnState, "checking">, string> = {
  paid: "Оплату отримано. Дякуємо!",
  failed: "Оплата не пройшла. Гроші не списано, можна спробувати ще раз.",
  pending: "Оплата ще обробляється. Рахунок оновиться, коли банк підтвердить її.",
};

const ReturnStatus = ({ state }: { state: FeesReturnState | null }) => (
  <div role="status" aria-live="polite">
    {state === "checking" && (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Перевіряємо оплату
      </div>
    )}
    {state && state !== "checking" && <p className="rounded-xl bg-hover-blue p-3 text-sm font-semibold text-ink">{RETURN_TEXT[state]}</p>}
  </div>
);

const Skeleton = () => (
  <div className="grid gap-3" aria-hidden>
    <div className="h-10 w-40 animate-pulse rounded-md bg-hover-blue" />
    <div className="h-4 w-56 animate-pulse rounded-md bg-hover-blue" />
    <div className="h-14 animate-pulse rounded-xl bg-hover-blue" />
    <div className="h-14 animate-pulse rounded-xl bg-hover-blue" />
  </div>
);

const EntryRow = ({ entry }: { entry: FeeTypes.EntryView }) => {
  const formula = entryFormula(entry);
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{entryTitle(entry)}</p>
        <p className="text-xs text-ink-muted">
          {entryDateText(entry.createdAt)}
          {formula ? ` · ${formula}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-sm font-semibold tabular-nums", entry.amountKop < 0 ? "text-tide" : "text-accent-ink")}>{signedKop(entry.amountKop)}</p>
        <p className="text-xs text-ink-muted">{kindLabel(entry.kind)}</p>
      </div>
    </li>
  );
};

const Entries = ({ entries }: { entries: FeeTypes.EntryView[] }) =>
  entries.length === 0 ? (
    <p className="text-sm text-ink-muted">Поки нічого не нараховано.</p>
  ) : (
    <ul className="divide-y divide-line">
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );

export const FeesScreen = () => {
  const screen = useFeesScreen();
  const { overview, debt, load } = screen;
  const payable = debt > 0;
  return (
    <Screen
      open={screen.open}
      onOpenChange={screen.onOpenChange}
      title="Рахунок"
      description="Комісія платформи за угоди з прямим переказом: борг, строк оплати й журнал."
      desktop="dialog"
      footer={
        payable ? (
          <div className="grid gap-2">
            {screen.payError && (
              <p role="alert" className="auth-error">
                {screen.payError}
              </p>
            )}
            <Button disabled={screen.paying} onClick={() => void screen.pay()} className="w-full">
              {screen.paying && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Сплатити {formatKop(debt)}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        <ReturnStatus state={screen.returned} />
        {load === "loading" && <Skeleton />}
        {load === "error" && !overview && (
          <div className="grid gap-3">
            <p role="alert" className="auth-error">
              Не вдалося завантажити рахунок.
            </p>
            <Button variant="secondary" className="w-fit" onClick={() => void screen.reload()}>
              Спробувати ще
            </Button>
          </div>
        )}
        {overview && (
          <>
            <section className="grid gap-1" aria-label="До сплати">
              <p className="text-xs text-ink-muted">До сплати</p>
              <p className="text-3xl font-semibold tabular-nums text-ink">{formatKop(debt)}</p>
              {payable && overview.dueAt && <p className="text-sm text-ink">Сплатити до {dueText(overview.dueAt)}</p>}
              <p className="mt-2 text-sm text-ink-muted">
                Це комісія платформи {rateText(POSTPAID_FEE_BP)} за угоди з прямим переказом. Нараховується, коли ви позначаєте оплату етапу. Сплатити можна будь-коли.
              </p>
              <PaymentModesHint />
            </section>
            <section className="grid gap-1" aria-label="Журнал">
              <h3 className="text-sm font-semibold text-ink">Журнал</h3>
              <Entries entries={overview.entries} />
            </section>
          </>
        )}
      </div>
    </Screen>
  );
};
