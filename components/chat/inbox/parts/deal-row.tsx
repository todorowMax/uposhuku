"use client";

// components/chat/inbox/parts/deal-row.tsx
//
// Рядок угоди під шапкою розмови: завжди 56 px. Одна угода: назва, етап і сума, стан, кнопка кроку, якщо він
// за мною. Кілька: «3 угоди · 1 чекає». Немає угод: тиха кнопка «Оформити умови». Рядок лише відкриває
// шар (екран чи шторку), сам нічого не виконує.

import type { Ref } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentStage } from "@/lib/deals/machine";
import { needsMe, nextStepOf, type NextStepTypes } from "@/lib/deals/next-step";
import { dealAmount, dealName, dealState, PAYMENT_RETURN_TEXT } from "@/lib/deals/summary";
import { paymentReturnStore } from "@/lib/deals/use-payment-return";
import type { Deal } from "@/lib/deals/types";
import type { OfferResponse } from "@/lib/requests/types";
import { useStore } from "@/lib/store";

const ROW = "flex h-14 shrink-0 items-center gap-3 border-b border-line px-4";
const MONEY = new Intl.NumberFormat("uk-UA");

const FORMS = new Intl.PluralRules("uk");
const DEAL_WORDS: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "угода", few: "угоди" };

const countText = (count: number, waiting: number): string => `${count} ${DEAL_WORDS[FORMS.select(count)] ?? "угод"} · ${waiting > 0 ? `${waiting} чекає` : "усі в роботі"}`;

const SingleDeal = ({ deal, role, panelOpen, onOpen, openRef }: { deal: Deal; role: NextStepTypes.Role; panelOpen: boolean; onOpen: () => void; openRef: Ref<HTMLButtonElement> }) => {
  const paymentReturn = useStore(paymentReturnStore);
  const step = nextStepOf(deal, role);
  const stage = currentStage(deal);
  const state = paymentReturn?.dealId === deal.id ? PAYMENT_RETURN_TEXT[paymentReturn.state] : dealState(deal, role);
  return (
    <div className={ROW}>
      <Button ref={openRef} variant="bare" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start text-left" aria-label={`Відкрити ${dealName(deal)}`}>
        <span className="w-full truncate text-sm font-semibold text-ink">
          {dealName(deal)}
          {stage && deal.status === "accepted" && deal.stages.length > 1 ? ` · ${stage.title}` : ""}
        </span>
        <span className="w-full truncate text-xs text-ink-muted">
          {dealAmount(deal)} · {state}
        </span>
      </Button>
      {step && (
        <Button variant="offer" onClick={onOpen} className="shrink-0" data-panel-open={panelOpen ? "" : undefined}>
          {step.label}
        </Button>
      )}
    </div>
  );
};

export const DealRow = ({
  ready,
  deals,
  role,
  response,
  panelOpen,
  gone = false,
  onOpen,
  openRef,
}: {
  ready: boolean;
  /** Співрозмовник видалив акаунт: нову угоду оформити не можна (сервер відповів би 409). */
  gone?: boolean;
  deals: Deal[];
  role: NextStepTypes.Role;
  response: OfferResponse | undefined;
  /** Панель угоди відкрита: від 768 px її кнопка кроку стоїть унизу панелі, тут її не дублюємо. */
  panelOpen: boolean;
  onOpen: () => void;
  /** Кнопка рядка: на неї повертається фокус, коли закрито екран, відкритий зі шторки. */
  openRef: Ref<HTMLButtonElement>;
}) => {
  if (!ready) {
    return (
      <div className={ROW} role="status" aria-busy="true">
        <Loader2 aria-hidden className="size-3.5 animate-spin text-ink-muted" />
        <span className="text-xs text-ink-muted">Завантажуємо угоди…</span>
      </div>
    );
  }
  if (deals.length === 1) return <SingleDeal deal={deals[0]} role={role} panelOpen={panelOpen} onOpen={onOpen} openRef={openRef} />;
  if (deals.length > 1) {
    const waiting = deals.filter((deal) => needsMe(deal, role)).length;
    return (
      <div className={ROW}>
        <Button ref={openRef} variant="bare" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-ink">
          <FileText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">{countText(deals.length, waiting)}</span>
          {waiting > 0 && <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand" />}
        </Button>
      </div>
    );
  }
  if (gone) {
    return (
      <div className={ROW}>
        <span className="truncate text-xs text-ink-muted">Нову угоду оформити не можна: співрозмовник видалив акаунт</span>
      </div>
    );
  }
  return (
    <div className={ROW}>
      <Button ref={openRef} variant="link" onClick={onOpen} className="text-sm">
        {response ? "Запропонувати угоду" : "Оформити умови"}
      </Button>
      {response && (
        <span className="truncate text-xs text-ink-muted">
          {response.price === null ? "Ціна після обговорення" : `${MONEY.format(response.price)} ₴`} · {response.days} дн.
        </span>
      )}
    </div>
  );
};
