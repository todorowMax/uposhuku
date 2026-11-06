// components/deals/deal-terms.tsx
//
// Умови угоди для того, хто ще не прийняв її: спосіб оплати, етапи, суми, комісія, хто що отримає.
// Людина приймає умови, а не заголовок.

import { daysWord, moneyIn } from "@/lib/deals/format";
import { dealTotal, feeOf, payoutOf } from "@/lib/deals/machine";
import { COMMISSION_LABEL } from "@/components/deals/commission-row";
import { dealCurrency, type Deal } from "@/lib/deals/types";

const METHOD_NOTE: Record<Deal["method"], { name: string; text: string }> = {
  direct: {
    name: "Прямий переказ",
    text: "Замовник переказує гроші вам напряму, без комісії платформи й без її гарантії.",
  },
  safe: {
    name: "Безпечна угода",
    text: "Гроші заморожуємо на картці замовника й віддаємо вам після того, як він підтвердить роботу.",
  },
  escrow: {
    name: "Ескроу (USDT)",
    text: "Замовник вносить USDT у контракт, ви здаєте роботу, замовник приймає. Платформа до грошей не має доступу.",
  },
};

export const DealTerms = ({ deal }: { deal: Deal }) => {
  const currency = dealCurrency(deal);
  const total = dealTotal(deal);
  const fee = feeOf(total, deal.method);
  const note = METHOD_NOTE[deal.method];
  return (
    <div className="mt-2 grid gap-2 text-sm leading-snug text-ink" data-testid="deal-terms">
      <p>
        <span className="font-semibold">{note.name}.</span> <span className="text-ink-muted">{note.text}</span>
      </p>
      {deal.description && <p className="text-ink/85">{deal.description}</p>}
      {deal.criteria && (
        <p className="text-ink/85">
          <span className="font-semibold">Що вважаємо готовим:</span> {deal.criteria}
        </p>
      )}
      <ol className="grid gap-1" aria-label="Етапи угоди">
        {deal.stages.map((stage) => (
          <li key={stage.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">{stage.title}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-muted">
              {moneyIn(stage.amount, currency)} · {stage.days} {daysWord(stage.days)}
            </span>
          </li>
        ))}
      </ol>
      <dl className="grid gap-0.5 text-ink-muted">
        {fee > 0 && (
          <div className="flex justify-between gap-3">
            <dt>{COMMISSION_LABEL} платить замовник</dt>
            <dd className="tabular-nums">{moneyIn(fee, currency)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3 font-semibold text-ink">
          <dt>Ви отримаєте{deal.method === "safe" ? " повністю" : ""}</dt>
          <dd className="tabular-nums">{moneyIn(payoutOf(total), currency)}</dd>
        </div>
      </dl>
    </div>
  );
};
