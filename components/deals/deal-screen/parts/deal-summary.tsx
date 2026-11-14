// components/deals/deal-screen/parts/deal-summary.tsx
//
// Сводка угоди: сума (назва стоїть у шапці екрана), спосіб оплати, чи є дія за мною, опис і критерії готовності.

import { dealAmount, METHOD_NAME } from "@/lib/deals/summary";
import type { Deal } from "@/lib/deals/types";

const chipText = (deal: Deal, todo: boolean): string => {
  if (deal.status === "proposed") return todo ? "Потрібна ваша дія" : "Чекаємо відповіді";
  if (deal.status === "completed") return "Завершено";
  if (deal.disputed) return "Спір";
  return todo ? "Потрібна ваша дія" : "В роботі";
};

export const DealSummary = ({ deal, todo }: { deal: Deal; todo: boolean }) => (
  <>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-semibold text-ink">
          {dealAmount(deal)}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{METHOD_NAME[deal.method]}</p>
      </div>
      <span className="deal-chip" data-tone={deal.status === "completed" ? "done" : todo ? "todo" : "wait"}>
        {chipText(deal, todo)}
      </span>
    </div>
    {deal.description && <p className="text-sm leading-snug text-ink/85">{deal.description}</p>}
    {deal.criteria && (
      <p className="text-sm leading-snug text-ink/85">
        <span className="font-semibold">Що вважаємо готовим:</span> {deal.criteria}
      </p>
    )}
  </>
);
