"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Check,
  Clock,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Star,
} from "@/components/icons";
import { StagesEditor, type StagesEditorTypes } from "@/components/deals/stages-editor";
import { TransferCard } from "@/components/deals/transfer-card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/auth/client";
import { dealAction, loadDeals, proposeDeal, startPayment, useDeals } from "@/lib/deals/client";
import { paymentReturnStore } from "@/lib/deals/use-payment-return";
import { useStore } from "@/lib/store";
import { daysWord, money, moneyIn } from "@/lib/deals/format";
import { AcceptedMethods } from "@/components/deals/accepted-methods";
import { useSafeDealOptions } from "@/lib/deals/use-safe-deal";
import { CommissionRow } from "@/components/deals/commission-row";
import { EscrowMethodOption } from "@/components/deals/escrow-method-option";
import { EscrowSection } from "@/components/wallet/escrow-section";
import { useEscrowAvailable } from "@/components/wallet/use-crypto-config";
import { ReleaseCodeBox } from "@/components/deals/release-code-box";
import { releaseNeedsCode } from "@/lib/deals/limits";
import { COMMISSION_RATE, formatKop, quoteStage, totalOf } from "@/lib/deals/price";
import {
  HOLD_DAYS,
  currencyOfMethod,
  dealCurrency,
  type Deal,
  type DealMethod,
  type DealStage,
} from "@/lib/deals/types";
import {
  currentStage,
  dealTotal,
  feeOf,
  initialMethod,
  needsAction,
  payoutOf,
  splitIntoStages,
  validateDraft,
} from "@/lib/deals/machine";
import { fetchMyReview, sendReview } from "@/lib/reviews/client";
import { REVIEW_TEXT_MAX, type Review } from "@/lib/reviews/types";
import type { OfferResponse } from "@/lib/requests/types";
import type { PaymentMethod } from "@/lib/deals/requisites";
import { useAutoGrow } from "@/lib/ui/auto-grow";

const DATE = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CURRENCY_SIGN = { UAH: "₴", USDT: "USDT" } as const;
const FEE_NOTE: Record<DealMethod, string> = { safe: "", direct: "немає", escrow: "за контрактом, видно перед внесенням" };
const AGREE_TEXT: Record<DealMethod, string> = {
  safe: "Розумію: гроші заморожуються на картці до підтвердження, а спір має закінчитися до кінця холду.",
  direct: "Розумію: це прямий переказ, платформа не гарантує повернення грошей, а податки сторони вирішують самі.",
  escrow: "Розумію: кошти лягають у контракт у блокчейні, платформа ними не володіє, а спір вирішує арбітр у мережі.",
};

/** Угода живе й не закрита відмовою чи скасуванням. */
export const liveDeal = (deals: Deal[], responseId: string) =>
  deals.find(
    (deal) =>
      deal.responseId === responseId &&
      deal.status !== "declined" &&
      deal.status !== "cancelled",
  );

/**
 * Вкладка «Угода» в чаті з виконавцем. Немає угоди — форма пропозиції (сума,
 * етапи, спосіб оплати); є — картка зі шляхом: погодження, оплата,
 * робота, підтвердження, відгук. Виконавець поки відповідає за таймером.
 */
export function DealTab({ response }: { response: OfferResponse }) {
  const deals = useDeals(response.requestId);
  const deal = liveDeal(deals, response.id);
  return deal ? <DealView deal={deal} /> : <DealComposer response={response} />;
}

// ---------------------------------------------------------------------------
// Пропозиція угоди

function DealComposer({ response }: { response: OfferResponse }) {
  // Чи доступна безпечна угода цій людині, вирішує сервер. Чи підключив виконавець виплати, він теж перевіряє сам.
  const { ready, safeEnabled, fop, methods } = useSafeDealOptions(response.performerId);
  const escrowAvailable = useEscrowAvailable();
  // Що людина обрала сама; поки не обирала, «Безпечна угода» лише тоді, коли вона справді доступна для цього виконавця.
  const [picked, setPicked] = useState<DealMethod | null>(null);
  const method: DealMethod = picked ?? initialMethod(safeEnabled, fop);
  const setMethod = setPicked;
  const [amount, setAmount] = useState(
    response.price ? String(response.price) : "",
  );
  const [days, setDays] = useState(String(response.days));
  /** Етапи, які людина правила руками; null — рахуємо з суми й терміну. */
  const [custom, setCustom] = useState<StagesEditorTypes.Edit[] | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount.replace(/\s/g, "")) || 0;
  const daysNumber = Number(days) || 0;

  const stages = useMemo(() => {
    if (custom)
      return custom.map((stage) => ({
        title: stage.title,
        amount: Number(stage.amount.replace(/\s/g, "")) || 0,
        days: Number(stage.days) || 0,
      }));
    if (amountNumber <= 0 || daysNumber <= 0) return [];
    return method !== "safe"
      ? [{ title: "Робота", amount: amountNumber, days: daysNumber }]
      : splitIntoStages(amountNumber, daysNumber);
  }, [method, custom, amountNumber, daysNumber]);

  const total = stages.reduce((sum, stage) => sum + stage.amount, 0);
  const fee = feeOf(total, method);
  const payTotal = useMemo(() => totalOf(stages.map((stage) => stage.amount)), [stages]);
  const performer = {
    id: response.performerId,
    name: response.name,
    photo: response.photo,
    avatarIndex: response.avatarIndex,
    specialty: response.specialty,
    fop,
  };
  const problem = stages.length
    ? validateDraft({
        requestId: response.requestId,
        responseId: response.id,
        performer,
        method,
        stages,
      }, safeEnabled, method === "escrow" ? Number.MAX_SAFE_INTEGER : null)
    : "Вкажіть суму й термін.";

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await proposeDeal({
        requestId: response.requestId,
        responseId: response.id,
        performer,
        method,
        stages,
      });
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Не вдалося запропонувати угоду.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deal">
      <p className="auth-lead">
        {safeEnabled
          ? "Зафіксуйте домовленість: суму, терміни й спосіб оплати. Виконавець побачить пропозицію й погодиться."
          : "Зафіксуйте домовленість: суму й терміни. Виконавець побачить пропозицію й погодиться."}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label={`Сума, ${CURRENCY_SIGN[currencyOfMethod(method)]}`} htmlFor="deal-amount">
          <Input
            id="deal-amount"
            inputMode="numeric"
            value={custom ? String(total) : amount}
            disabled={Boolean(custom)}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d\s]/g, ""))
            }
            placeholder="12 500"
            className="tabular-nums"
          />
        </Field>
        <Field label="Термін, днів" htmlFor="deal-days">
          <Input
            id="deal-days"
            inputMode="numeric"
            value={
              custom
                ? String(stages.reduce((sum, stage) => sum + stage.days, 0))
                : days
            }
            disabled={Boolean(custom)}
            onChange={(event) =>
              setDays(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="14"
            className="tabular-nums"
          />
        </Field>
      </div>

      <fieldset className="deal-methods" hidden={!safeEnabled && !escrowAvailable}>
        <legend className="pe-label">Як платити</legend>
        <label
          className="deal-method"
          data-selected={method === "safe" || undefined}
          data-disabled={!fop || undefined}
          hidden={!safeEnabled}
        >
          <input
            type="radio"
            name="method"
            checked={method === "safe"}
            disabled={!fop}
            onChange={() => setMethod("safe")}
          />
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldCheck className="size-4 text-[#4d7a5e]" />
            Безпечна угода
            {fop && <span className="deal-badge">Рекомендуємо</span>}
          </span>
          <span className="deal-method-text">
            {!ready
              ? "Перевіряємо, чи виконавець підключив виплати."
              : fop
              ? `Гроші заморожуємо на вашій картці й віддаємо виконавцю, коли ви підтвердите роботу. Виконавець отримує свою ціну повністю, а до оплати додаємо комісію ${Math.round(COMMISSION_RATE * 100)}%.`
              : "Недоступна: виконавець ще не підключив виплати на картку ФОП."}
          </span>
        </label>
        <label
          className="deal-method"
          data-selected={method === "direct" || undefined}
        >
          <input
            type="radio"
            name="method"
            checked={method === "direct"}
            onChange={() => setMethod("direct")}
          />
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <QrCode className="size-4 text-ink-muted" />
            Прямий переказ
          </span>
          <span className="deal-method-text">
            Без комісії, переказ на рахунок виконавця: одним платежем або за
            етапами. Без гарантії платформи: у спорі гроші ми не повертаємо.
          </span>
        </label>
        {escrowAvailable && <EscrowMethodOption id="deal-escrow" selected={method === "escrow"} onChange={(on) => setMethod(on ? "escrow" : null)} />}
      </fieldset>
      {method === "direct" && <AcceptedMethods methods={methods} />}
      {!safeEnabled && !escrowAvailable && (
        <p className="pe-hint">
          Оплата прямим переказом виконавцю: без комісії платформи й без її
          гарантії, у спорі гроші ми не повертаємо.
        </p>
      )}

      {stages.length > 0 && (
        <StagesEditor
          method={method}
          stages={stages}
          amount={amountNumber}
          days={daysNumber}
          custom={custom}
          onCustom={setCustom}
        />
      )}

      <dl className="deal-summary">
        {method === "safe" ? (
          <>
            <div>
              <dt>Вартість роботи (отримає виконавець)</dt>
              <dd className="tabular-nums">{money(total)}</dd>
            </div>
            <CommissionRow amount={money(fee)} />
            <div>
              <dt>До оплати</dt>
              <dd className="tabular-nums">
                {stages.length > 0 ? formatKop(payTotal) : "—"}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Ви платите</dt>
              <dd className="tabular-nums">{moneyIn(total, currencyOfMethod(method))}</dd>
            </div>
            <div>
              <dt>Комісія платформи</dt>
              <dd>{FEE_NOTE[method]}</dd>
            </div>
          </>
        )}
      </dl>

      <label className="feed-check items-start">
        <input
          type="checkbox"
          checked={agree}
          onChange={(event) => setAgree(event.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[12px] leading-snug text-ink-muted">
          {AGREE_TEXT[method]}
        </span>
      </label>

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={
          busy || !agree || Boolean(problem && !error && stages.length === 0)
        }
        className="auth-primary"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Запропонувати угоду
      </button>
      {problem && agree && !error && stages.length > 0 && (
        <p className="pe-hint text-[#a4513c]">{problem}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Угода в роботі

const STAGE_LABEL: Record<DealStage["status"], string> = {
  pending: "Очікує оплати",
  claimed: "Перевіряємо оплату",
  funded: "В роботі",
  delivered: "Здано, чекає вашого підтвердження",
  releasing: "Виплата виконується, чекаємо підтвердження банку",
  released: "Виплачено",
  disputed: "Спір",
  refunding: "Повернення виконується, чекаємо підтвердження банку",
  refunded: "Кошти повернено",
};

const RETURN_NOTE = {
  checking: "Перевіряємо оплату в банку…",
  held: "Банк підтвердив: кошти заморожено.",
  failed: "Оплату не завершено. Гроші не списано, можна спробувати ще раз.",
  pending: "Банк ще обробляє оплату. Статус оновиться сам, коли він підтвердить.",
} as const;

export function DealView({ deal }: { deal: Deal }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<DealStage | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<DealStage | null>(null);
  const total = dealTotal(deal);
  const stage = currentStage(deal);
  const todo = needsAction(deal);

  useLayoutEffect(() => {
    if (!ref.current || reduced()) return;
    const tween = gsap.fromTo(
      ref.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" },
    );
    return () => {
      tween.kill();
    };
  }, [deal.status]);

  const paymentReturn = useStore(paymentReturnStore);

  /** Оплата етапу: рахунок у банку, далі йдемо на його сторінку. Статус «заморожено» поставить сам банк. */
  const pay = async () => {
    setBusy("fund");
    setError(null);
    try {
      window.location.assign(await startPayment(deal));
      return true;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося перейти до оплати.");
      setBusy(null);
      return false;
    }
  };

  const run = async (
    action: Parameters<typeof dealAction>[1],
    target?: DealStage,
    extra: { code?: string; via?: PaymentMethod } = {},
  ) => {
    setBusy(action);
    setError(null);
    try {
      await dealAction(deal, action, { stageId: target?.id, ...extra });
      setCheckout(null);
      setConfirmRelease(null);
      return true;
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Не вдалося виконати дію.",
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="deal">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">
            {deal.title ? `${deal.title} · ` : "Угода "}
            {deal.number}
            <span className="ml-2 text-[13px] font-normal tabular-nums text-ink-muted">
              {moneyIn(total, dealCurrency(deal))}
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {deal.method === "safe" ? "Безпечна угода" : deal.method === "escrow" ? "Ескроу (USDT)" : "Прямий переказ"}
          </p>
        </div>
        <span
          className="deal-chip"
          data-tone={
            deal.status === "completed" ? "done" : todo ? "todo" : "wait"
          }
        >
          {deal.status === "proposed" && "Чекаємо відповіді"}
          {deal.status === "completed" && "Завершено"}
          {deal.status === "accepted" &&
            (deal.disputed ? "Спір" : todo ? "Потрібна ваша дія" : "В роботі")}
        </span>
      </div>

      {deal.description && (
        <p className="text-[13px] leading-snug text-ink/85">
          {deal.description}
        </p>
      )}

      {deal.status === "proposed" && deal.proposedBy === "performer" && (
        <div className="deal-wait" data-incoming>
          <div className="grid w-full gap-2">
            <p>
              {deal.performer.name} пропонує умови: {moneyIn(total, dealCurrency(deal))}
              {deal.stages.length === 1
                ? `, ${deal.stages[0].days} ${daysWord(deal.stages[0].days)}`
                : `, ${deal.stages.length} ${deal.stages.length < 5 ? "етапи" : "етапів"}`}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("accept")}
                className="auth-primary"
                style={{ width: "auto", minHeight: 36, padding: "0 16px" }}
              >
                Прийняти умови
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("decline")}
                className="auth-link text-[13px]"
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      )}

      {deal.status === "proposed" && deal.proposedBy !== "performer" && (
        <div className="deal-wait">
          <Loader2 className="size-4 animate-spin text-ink-muted" />
          <p>
            Чекаємо, поки {deal.performer.name} погодиться. Зазвичай це кілька
            хвилин.
          </p>
          <button
            type="button"
            disabled={busy === "cancel"}
            onClick={() => void run("cancel")}
            className="auth-link text-[12px]"
          >
            Скасувати пропозицію
          </button>
        </div>
      )}

      {deal.status !== "proposed" && (
        <ol className="deal-timeline" aria-label="Етапи угоди">
          {deal.stages.map((item, index) => {
            const active = item.id === stage?.id && deal.status === "accepted";
            return (
              <li
                key={item.id}
                data-state={item.status}
                data-active={active || undefined}
              >
                <span className="deal-dot">
                  {item.status === "released" ? (
                    <Check className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-ink">
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 font-normal tabular-nums text-ink-muted">
                      {moneyIn(item.amount, dealCurrency(deal))} · {item.days} {daysWord(item.days)}
                    </span>
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    {STAGE_LABEL[item.status]}
                  </p>

                  {active && (
                    <StageActions
                      deal={deal}
                      stage={item}
                      busy={busy}
                      checkout={checkout?.id === item.id}
                      confirmRelease={confirmRelease?.id === item.id}
                      onCheckout={() => setCheckout(item)}
                      onCancelCheckout={() => setCheckout(null)}
                      onFund={pay}
                      onClaim={(via) => run("claim_paid", item, { via })}
                      onAskRelease={() => setConfirmRelease(item)}
                      onCancelRelease={() => setConfirmRelease(null)}
                      onRelease={(code) => run("release", item, { code })}
                      onDispute={() => run("dispute", item)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {paymentReturn?.dealId === deal.id && (
        <p role="status" className="deal-note">
          {RETURN_NOTE[paymentReturn.state]}
        </p>
      )}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}

      {deal.status === "completed" && <ReviewForm deal={deal} />}
    </div>
  );
}

function StageActions({
  deal,
  stage,
  busy,
  checkout,
  confirmRelease,
  onCheckout,
  onCancelCheckout,
  onFund,
  onClaim,
  onAskRelease,
  onCancelRelease,
  onRelease,
  onDispute,
}: {
  deal: Deal;
  stage: DealStage;
  busy: string | null;
  checkout: boolean;
  confirmRelease: boolean;
  onCheckout: () => void;
  onCancelCheckout: () => void;
  onFund: () => Promise<boolean>;
  onClaim: (via?: PaymentMethod) => Promise<boolean>;
  onAskRelease: () => void;
  onCancelRelease: () => void;
  onRelease: (code?: string) => Promise<boolean>;
  onDispute: () => Promise<boolean>;
}) {
  const safe = deal.method === "safe";
  const quote = quoteStage(stage.amount);

  if (deal.method === "escrow") {
    return <EscrowSection deal={deal} stage={stage} side="customer" onChanged={() => void loadDeals(deal.requestId)} />;
  }

  if (stage.status === "pending" && safe) {
    return checkout ? (
      <div className="deal-box">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Оплата через Monobank
        </p>
        <dl className="deal-summary mt-2">
          <div>
            <dt>Вартість роботи</dt>
            <dd className="tabular-nums">{formatKop(quote.price)}</dd>
          </div>
          <CommissionRow amount={formatKop(quote.fee)} />
          <div>
            <dt>До оплати</dt>
            <dd className="tabular-nums font-semibold">
              {formatKop(quote.total)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-ink">
          Ви перейдете на сторінку банку й заморозите{" "}
          <strong className="tabular-nums">{formatKop(quote.total)}</strong> на
          вашій картці на {HOLD_DAYS} днів. Гроші не списуються, поки ви не
          підтвердите роботу. Виконавець отримає{" "}
          <span className="tabular-nums">{formatKop(quote.price)}</span>{" "}
          повністю.
        </p>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={busy === "fund"}
            onClick={() => void onFund()}
            className="offer-primary"
          >
            {busy === "fund" && <Loader2 className="size-4 animate-spin" />}
            Оплатити {formatKop(quote.total)}
          </button>
          <button
            type="button"
            disabled={busy === "fund"}
            onClick={onCancelCheckout}
            className="auth-link text-[12px]"
          >
            Назад
          </button>
        </div>
      </div>
    ) : (
      <button type="button" onClick={onCheckout} className="offer-primary mt-2">
        <Lock className="size-4" />
        Перейти до оплати
      </button>
    );
  }

  if (stage.status === "pending") {
    return (
      <TransferCard
        dealId={deal.id}
        requestId={deal.requestId}
        stageId={stage.id}
        dealNumber={deal.number}
        amount={stage.amount}
        busy={busy === "claim_paid"}
        onClaim={onClaim}
      />
    );
  }

  if (stage.status === "claimed") {
    return (
      <div className="deal-note">
        <Loader2 className="size-3.5 animate-spin" />
        Виконавець підтверджує, що гроші дійшли.
      </div>
    );
  }

  if (stage.status === "funded") {
    return (
      <div className="deal-note">
        <Clock className="size-3.5" />
        {safe && stage.holdUntil
          ? `${stage.payment ? `Заморожено ${formatKop(stage.payment.total)}` : "Кошти заморожено"} до ${DATE.format(new Date(stage.holdUntil))}. Виконавець працює.`
          : "Оплату підтверджено, виконавець працює."}
      </div>
    );
  }

  if (stage.status === "delivered") {
    if (confirmRelease && safe && releaseNeedsCode(stage.amount)) {
      return <ReleaseCodeBox dealId={deal.id} amount={money(payoutOf(stage.amount))} busy={busy === "release"} onConfirm={onRelease} onCancel={onCancelRelease} />;
    }
    if (confirmRelease) {
      return (
        <div className="deal-box">
          <p className="text-[13px] text-ink">
            {safe
              ? `Виплатити ${money(payoutOf(stage.amount))} виконавцю?`
              : "Підтвердити, що роботу прийнято?"}{" "}
            Скасувати це не вийде.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy === "release"}
              onClick={() => void onRelease()}
              className="offer-primary flex-1"
            >
              {busy === "release" && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Так, все добре
            </button>
            <button
              type="button"
              onClick={onCancelRelease}
              className="offer-secondary"
            >
              Ні
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {stage.payoutError && (
          <p role="alert" className="auth-error w-full">
            {stage.payoutError}
          </p>
        )}
        <button type="button" onClick={onAskRelease} className="offer-primary">
          <Check className="size-4" />
          {safe ? "Підтвердити й виплатити" : "Прийняти роботу"}
        </button>
        {safe && (
          <button
            type="button"
            disabled={busy === "dispute"}
            onClick={() => void onDispute()}
            className="offer-secondary"
          >
            Є претензії
          </button>
        )}
      </div>
    );
  }

  if (stage.status === "releasing" || stage.status === "refunding") {
    return (
      <div className="deal-note" role="status">
        <Loader2 className="size-3.5 animate-spin" />
        {stage.status === "releasing"
          ? "Виплату передано в банк. «Виплачено» з'явиться, щойно банк її підтвердить."
          : "Повернення передано в банк. «Кошти повернено» з'явиться, щойно банк його підтвердить."}
      </div>
    );
  }

  if (stage.status === "disputed") {
    return (
      <div className="deal-note deal-note-warn">
        <ShieldCheck className="size-3.5" />
        Спір відкрито. Кошти лишаються замороженими, модератор прочитає чат і
        зв'яжеться з вами протягом доби.
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Відгук про роботу

function ReviewForm({ deal }: { deal: Deal }) {
  const [existing, setExisting] = useState<Review | null | undefined>(
    undefined,
  );
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const textRef = useAutoGrow(text, 8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyReview(deal.id)
      .then((review) => !cancelled && setExisting(review))
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  if (existing === undefined) return null;
  if (existing) {
    return (
      <div className="deal-box">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4d7a5e]">
          <Check className="size-4" />
          Дякуємо за відгук
        </div>
        <Stars value={existing.stars} />
        {existing.text && (
          <p className="mt-1.5 text-[12px] leading-snug text-ink">
            {existing.text}
          </p>
        )}
        <p className="pe-hint mt-1.5">
          Його побачать інші замовники в профілі виконавця.
        </p>
      </div>
    );
  }

  const shown = hover || stars;
  const submit = async () => {
    if (!stars) return setError("Оберіть оцінку.");
    setBusy(true);
    setError(null);
    try {
      setExisting(await sendReview(deal.id, stars, text));
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Не вдалося надіслати відгук.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deal-box">
      <p className="text-[14px] font-semibold text-ink">Як пройшла робота?</p>
      <p className="pe-hint">
        Оцінка й відгук потрапляють у профіль {deal.performer.name}. Їх бачать
        усі замовники.
      </p>
      <div
        className="mt-2 flex gap-1"
        role="radiogroup"
        aria-label="Оцінка"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={stars === value}
            aria-label={`${value} з 5`}
            onMouseEnter={() => setHover(value)}
            onClick={() => setStars(value)}
            className="deal-star"
            data-on={value <= shown || undefined}
          >
            <Star className="size-6" />
          </button>
        ))}
      </div>
      <label htmlFor={`review-${deal.id}`} className="sr-only">
        Відгук
      </label>
      <Textarea
        id={`review-${deal.id}`}
        ref={textRef}
        value={text}
        maxLength={REVIEW_TEXT_MAX}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Що сподобалось, що можна покращити (необов'язково)"
        className="mt-2 resize-y"
      />
      {error && (
        <p role="alert" className="auth-error mt-1">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="offer-primary mt-2 w-full"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Надіслати відгук
      </button>
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span
      className="inline-flex gap-0.5"
      role="img"
      aria-label={`${value} з 5`}
    >
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          width={size}
          height={size}
          className={
            index <= Math.round(value)
              ? "fill-brand text-brand"
              : "text-[#a7bcc0]"
          }
        />
      ))}
    </span>
  );
}
