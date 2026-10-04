"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Check, Clock, Loader2, Lock, QrCode, ShieldCheck, Star, Plus, Trash2 } from "@/components/icons";
import { ApiError } from "@/lib/auth/client";
import { dealAction, proposeDeal, useDeals } from "@/lib/deals/client";
import { isFop } from "@/lib/deals/fop";
import { HOLD_DAYS, MAX_STAGES, SAFE_FEE, type Deal, type DealMethod, type DealStage } from "@/lib/deals/types";
import { currentStage, dealTotal, feeOf, needsAction, payoutOf, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import { fetchMyReview, sendReview } from "@/lib/reviews/client";
import { REVIEW_TEXT_MAX, type Review } from "@/lib/reviews/types";
import type { OfferResponse } from "@/lib/requests/types";
import { useAutoGrow } from "@/lib/ui/auto-grow";

const PRICE = new Intl.NumberFormat("uk-UA");
const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const money = (value: number) => `${PRICE.format(value)} ₴`;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const daysWord = (days: number) => {
  const tens = days % 100;
  const ones = days % 10;
  if (ones === 1 && tens !== 11) return "день";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "дні";
  return "днів";
};

/** Угода живе й не закрита відмовою чи скасуванням. */
export const liveDeal = (deals: Deal[], responseId: string) =>
  deals.find((deal) => deal.responseId === responseId && deal.status !== "declined" && deal.status !== "cancelled");

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
  const fop = isFop(response.performerId);
  const [method, setMethod] = useState<DealMethod>(fop ? "safe" : "direct");
  const [amount, setAmount] = useState(response.price ? String(response.price) : "");
  const [days, setDays] = useState(String(response.days));
  /** Етапи, які людина правила руками; null — рахуємо з суми й терміну. */
  const [custom, setCustom] = useState<{ title: string; amount: string; days: string }[] | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount.replace(/\s/g, "")) || 0;
  const daysNumber = Number(days) || 0;

  const stages = useMemo(() => {
    if (method === "direct") return amountNumber > 0 && daysNumber > 0 ? [{ title: "Робота", amount: amountNumber, days: daysNumber }] : [];
    if (custom) return custom.map((stage) => ({ title: stage.title, amount: Number(stage.amount.replace(/\s/g, "")) || 0, days: Number(stage.days) || 0 }));
    return amountNumber > 0 && daysNumber > 0 ? splitIntoStages(amountNumber, daysNumber) : [];
  }, [method, custom, amountNumber, daysNumber]);

  const total = stages.reduce((sum, stage) => sum + stage.amount, 0);
  const fee = feeOf(total, method);
  const performer = { id: response.performerId, name: response.name, photo: response.photo, avatarIndex: response.avatarIndex, specialty: response.specialty, fop };
  const problem = stages.length ? validateDraft({ requestId: response.requestId, responseId: response.id, performer, method, stages }) : "Вкажіть суму й термін.";

  const editStage = (index: number, patch: Partial<{ title: string; amount: string; days: string }>) =>
    setCustom((current) => (current ?? stages.map((stage) => ({ title: stage.title, amount: String(stage.amount), days: String(stage.days) }))).map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));

  const startCustom = () => setCustom(stages.map((stage) => ({ title: stage.title, amount: String(stage.amount), days: String(stage.days) })));

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await proposeDeal({ requestId: response.requestId, responseId: response.id, performer, method, stages });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося запропонувати угоду.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deal">
      <p className="auth-lead">Зафіксуйте домовленість: суму, терміни й спосіб оплати. Виконавець побачить пропозицію й погодиться.</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="deal-amount" className="pe-label">
            Сума, ₴
          </label>
          <input
            id="deal-amount"
            inputMode="numeric"
            value={custom && method === "safe" ? String(total) : amount}
            disabled={Boolean(custom) && method === "safe"}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="12 500"
            className="auth-input w-full tabular-nums"
          />
        </div>
        <div>
          <label htmlFor="deal-days" className="pe-label">
            Термін, днів
          </label>
          <input
            id="deal-days"
            inputMode="numeric"
            value={custom && method === "safe" ? String(stages.reduce((sum, stage) => sum + stage.days, 0)) : days}
            disabled={Boolean(custom) && method === "safe"}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="14"
            className="auth-input w-full tabular-nums"
          />
        </div>
      </div>

      <fieldset className="deal-methods">
        <legend className="pe-label">Як платити</legend>
        <label className="deal-method" data-selected={method === "safe" || undefined} data-disabled={!fop || undefined}>
          <input type="radio" name="method" checked={method === "safe"} disabled={!fop} onChange={() => setMethod("safe")} />
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <ShieldCheck className="size-4 text-[#4d7a5e]" />
            Безпечна угода
            {fop && <span className="deal-badge">Рекомендуємо</span>}
          </span>
          <span className="deal-method-text">
            {fop
              ? `Гроші заморожуємо на вашій картці й віддаємо виконавцю, коли ви підтвердите роботу. До ${HOLD_DAYS} днів на етап. Комісія ${Math.round(SAFE_FEE * 100)}%.`
              : "Недоступна: виконавець не ФОП. Безпечна угода лише для виконавців-ФОП."}
          </span>
        </label>
        <label className="deal-method" data-selected={method === "direct" || undefined}>
          <input type="radio" name="method" checked={method === "direct"} onChange={() => setMethod("direct")} />
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <QrCode className="size-4 text-ink-muted" />
            Прямий переказ за QR
          </span>
          <span className="deal-method-text">Без комісії, переказ одним платежем на рахунок виконавця. Без гарантії платформи: у спорі гроші ми не повертаємо.</span>
        </label>
      </fieldset>

      {method === "safe" && stages.length > 0 && (
        <div className="deal-stages">
          <div className="flex items-center justify-between gap-2">
            <p className="pe-label !mb-0">Етапи</p>
            {custom ? (
              <button type="button" onClick={() => setCustom(null)} className="auth-link text-[12px]">
                Розбити автоматично
              </button>
            ) : (
              stages.length > 1 && (
                <button type="button" onClick={startCustom} className="auth-link text-[12px]">
                  Змінити
                </button>
              )
            )}
          </div>
          {stages.length > 1 && !custom && (
            <p className="pe-hint">Холд триває до {HOLD_DAYS} днів, тож довшу роботу ділимо на етапи: кожен оплачується окремо.</p>
          )}
          {custom
            ? custom.map((stage, index) => (
                <div key={index} className="deal-stage-edit">
                  <input aria-label={`Назва етапу ${index + 1}`} value={stage.title} onChange={(event) => editStage(index, { title: event.target.value })} className="auth-input min-w-0 flex-1" />
                  <input aria-label={`Сума етапу ${index + 1}`} inputMode="numeric" value={stage.amount} onChange={(event) => editStage(index, { amount: event.target.value.replace(/[^\d\s]/g, "") })} className="auth-input w-[88px] tabular-nums" />
                  <input aria-label={`Днів в етапі ${index + 1}`} inputMode="numeric" value={stage.days} onChange={(event) => editStage(index, { days: event.target.value.replace(/\D/g, "").slice(0, 3) })} className="auth-input w-[52px] tabular-nums" />
                  {custom.length > 1 && (
                    <button type="button" onClick={() => setCustom(custom.filter((_, i) => i !== index))} aria-label={`Прибрати етап ${index + 1}`} className="auth-icon-button shrink-0">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))
            : stages.length > 1 &&
              stages.map((stage, index) => (
                <p key={index} className="deal-stage-line">
                  <span>{stage.title}</span>
                  <span className="tabular-nums">
                    {money(stage.amount)} · {stage.days} {daysWord(stage.days)}
                  </span>
                </p>
              ))}
          {custom && custom.length < MAX_STAGES && (
            <button type="button" onClick={() => setCustom([...custom, { title: `Етап ${custom.length + 1}`, amount: "", days: "" }])} className="auth-link inline-flex items-center gap-1 text-[12px]">
              <Plus className="size-3.5" />
              Додати етап
            </button>
          )}
        </div>
      )}

      <dl className="deal-summary">
        <div>
          <dt>Ви платите</dt>
          <dd className="tabular-nums">{money(total)}</dd>
        </div>
        {method === "safe" ? (
          <>
            <div>
              <dt>Комісія платформи, {Math.round(SAFE_FEE * 100)}%</dt>
              <dd className="tabular-nums">{money(fee)}</dd>
            </div>
            <div>
              <dt>Виконавець отримає</dt>
              <dd className="tabular-nums">{money(total - fee)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Комісія платформи</dt>
            <dd>немає</dd>
          </div>
        )}
      </dl>

      <label className="feed-check items-start">
        <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} className="mt-0.5" />
        <span className="text-[12px] leading-snug text-ink-muted">
          {method === "safe"
            ? "Розумію: гроші заморожуються на картці до підтвердження, а спір має закінчитися до кінця холду."
            : "Розумію: це прямий переказ, платформа не гарантує повернення грошей, а податки сторони вирішують самі."}
        </span>
      </label>

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void submit()} disabled={busy || !agree || Boolean(problem && !error && stages.length === 0)} className="auth-primary">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Запропонувати угоду
      </button>
      {problem && agree && !error && stages.length > 0 && <p className="pe-hint text-[#a4513c]">{problem}</p>}
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
  released: "Виплачено",
  disputed: "Спір",
};

function DealView({ deal }: { deal: Deal }) {
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
    const tween = gsap.fromTo(ref.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [deal.status]);

  const run = async (action: Parameters<typeof dealAction>[1], target?: DealStage, simulate?: "declined") => {
    setBusy(action);
    setError(null);
    try {
      await dealAction(deal, action, target?.id, simulate);
      setCheckout(null);
      setConfirmRelease(null);
      return true;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося виконати дію.");
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
            Угода {deal.number}
            <span className="ml-2 text-[13px] font-normal tabular-nums text-ink-muted">{money(total)}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-ink-muted">{deal.method === "safe" ? "Безпечна угода" : "Прямий переказ за QR"}</p>
        </div>
        <span className="deal-chip" data-tone={deal.status === "completed" ? "done" : todo ? "todo" : "wait"}>
          {deal.status === "proposed" && "Чекаємо відповіді"}
          {deal.status === "completed" && "Завершено"}
          {deal.status === "accepted" && (deal.disputed ? "Спір" : todo ? "Потрібна ваша дія" : "В роботі")}
        </span>
      </div>

      {deal.status === "proposed" && (
        <div className="deal-wait">
          <Loader2 className="size-4 animate-spin text-ink-muted" />
          <p>Чекаємо, поки {deal.performer.name} погодиться. Зазвичай це кілька хвилин.</p>
          <button type="button" disabled={busy === "cancel"} onClick={() => void run("cancel")} className="auth-link text-[12px]">
            Скасувати пропозицію
          </button>
        </div>
      )}

      {deal.status !== "proposed" && (
        <ol className="deal-timeline" aria-label="Етапи угоди">
          {deal.stages.map((item, index) => {
            const active = item.id === stage?.id && deal.status === "accepted";
            return (
              <li key={item.id} data-state={item.status} data-active={active || undefined}>
                <span className="deal-dot">{item.status === "released" ? <Check className="size-3" /> : index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-ink">
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 font-normal tabular-nums text-ink-muted">
                      {money(item.amount)} · {item.days} {daysWord(item.days)}
                    </span>
                  </p>
                  <p className="text-[12px] text-ink-muted">{STAGE_LABEL[item.status]}</p>

                  {active && (
                    <StageActions
                      deal={deal}
                      stage={item}
                      busy={busy}
                      checkout={checkout?.id === item.id}
                      confirmRelease={confirmRelease?.id === item.id}
                      onCheckout={() => setCheckout(item)}
                      onCancelCheckout={() => setCheckout(null)}
                      onFund={(simulate) => run("fund", item, simulate)}
                      onClaim={() => run("claim_paid", item)}
                      onAskRelease={() => setConfirmRelease(item)}
                      onCancelRelease={() => setConfirmRelease(null)}
                      onRelease={() => run("release", item)}
                      onDispute={() => run("dispute", item)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
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
  onFund: (simulate?: "declined") => Promise<boolean>;
  onClaim: () => Promise<boolean>;
  onAskRelease: () => void;
  onCancelRelease: () => void;
  onRelease: () => Promise<boolean>;
  onDispute: () => Promise<boolean>;
}) {
  const safe = deal.method === "safe";

  if (stage.status === "pending" && safe) {
    return checkout ? (
      <div className="deal-box">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Monobank · тестовий режим</p>
        <p className="mt-1 text-[13px] text-ink">
          Заморожуємо <strong className="tabular-nums">{money(stage.amount)}</strong> на вашій картці на {HOLD_DAYS} днів. Гроші не списуються, поки ви не підтвердите роботу.
        </p>
        <div className="mt-3 grid gap-2">
          <button type="button" disabled={busy === "fund"} onClick={() => void onFund()} className="offer-primary">
            {busy === "fund" && <Loader2 className="size-4 animate-spin" />}
            Заморозити (тест)
          </button>
          <button type="button" disabled={busy === "fund"} onClick={() => void onFund("declined")} className="offer-secondary">
            Імітувати відмову банку
          </button>
          <button type="button" disabled={busy === "fund"} onClick={onCancelCheckout} className="auth-link text-[12px]">
            Назад
          </button>
        </div>
      </div>
    ) : (
      <button type="button" onClick={onCheckout} className="offer-primary mt-2">
        <Lock className="size-4" />
        Заморозити {money(stage.amount)}
      </button>
    );
  }

  if (stage.status === "pending") {
    return <QrBlock deal={deal} stage={stage} busy={busy === "claim_paid"} onClaim={onClaim} />;
  }

  if (stage.status === "claimed") {
    return (
      <p className="deal-note">
        <Loader2 className="size-3.5 animate-spin" />
        Виконавець підтверджує, що гроші дійшли.
      </p>
    );
  }

  if (stage.status === "funded") {
    return (
      <p className="deal-note">
        <Clock className="size-3.5" />
        {safe && stage.holdUntil ? `Кошти заморожено до ${DATE.format(new Date(stage.holdUntil))}. Виконавець працює.` : "Оплату підтверджено, виконавець працює."}
      </p>
    );
  }

  if (stage.status === "delivered") {
    if (confirmRelease) {
      return (
        <div className="deal-box">
          <p className="text-[13px] text-ink">
            {safe ? `Виплатити ${money(payoutOf(stage.amount, "safe"))} виконавцю?` : "Підтвердити, що роботу прийнято?"} Скасувати це не вийде.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy === "release"} onClick={() => void onRelease()} className="offer-primary flex-1">
              {busy === "release" && <Loader2 className="size-4 animate-spin" />}
              Так, все добре
            </button>
            <button type="button" onClick={onCancelRelease} className="offer-secondary">
              Ні
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onAskRelease} className="offer-primary">
          <Check className="size-4" />
          {safe ? "Підтвердити й виплатити" : "Прийняти роботу"}
        </button>
        {safe && (
          <button type="button" disabled={busy === "dispute"} onClick={() => void onDispute()} className="offer-secondary">
            Є претензії
          </button>
        )}
      </div>
    );
  }

  if (stage.status === "disputed") {
    return (
      <p className="deal-note deal-note-warn">
        <ShieldCheck className="size-3.5" />
        Спір відкрито. Кошти лишаються замороженими, модератор прочитає чат і зв'яжеться з вами протягом доби.
      </p>
    );
  }
  return null;
}

/** Деталі переказу з QR (за стандартом НБУ, тут умовний) і «Я оплатив». */
function QrBlock({ deal, stage, busy, onClaim }: { deal: Deal; stage: DealStage; busy: boolean; onClaim: () => Promise<boolean> }) {
  const cells = useMemo(() => qrCells(`${deal.number}${stage.id}`), [deal.number, stage.id]);
  const last4 = (Math.abs(hashCode(deal.performer.id)) % 9000) + 1000;
  return (
    <div className="deal-box">
      <div className="flex gap-3">
        <svg viewBox="0 0 25 25" className="deal-qr" role="img" aria-label="Тестовий QR для переказу" shapeRendering="crispEdges">
          <rect width="25" height="25" fill="#fff" />
          {cells.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1f2a2e" />
          ))}
        </svg>
        <dl className="min-w-0 flex-1 text-[12px] leading-snug">
          <dt className="text-ink-muted">Отримувач</dt>
          <dd className="truncate font-medium text-ink">{deal.performer.name}</dd>
          <dt className="mt-1.5 text-ink-muted">Рахунок</dt>
          <dd className="font-medium tabular-nums text-ink">UA•• •••• •••• •••• •••• {last4}</dd>
          <dt className="mt-1.5 text-ink-muted">Сума</dt>
          <dd className="font-semibold tabular-nums text-ink">{money(stage.amount)}</dd>
          <dt className="mt-1.5 text-ink-muted">Призначення</dt>
          <dd className="text-ink">Оплата за роботу, угода {deal.number}</dd>
        </dl>
      </div>
      <p className="pe-hint mt-2">Тестовий QR: у бойовому режимі тут QR за стандартом НБУ, який відкриє застосунок будь-якого українського банку. Реквізити бачите лише ви в цьому чаті.</p>
      <button type="button" disabled={busy} onClick={() => void onClaim()} className="offer-primary mt-3 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}Я оплатив(ла)
      </button>
    </div>
  );
}

const hashCode = (value: string) => {
  let result = 0;
  for (let index = 0; index < value.length; index++) result = (Math.imul(result, 31) + value.charCodeAt(index)) | 0;
  return result;
};

/** Умовний QR: три «мітки» по кутах і щільне поле з хешу. Лише ілюстрація. */
const qrCells = (seed: string): [number, number][] => {
  const cells: [number, number][] = [];
  let state = Math.abs(hashCode(seed)) || 1;
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    return state;
  };
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || y === 0 || x === 6 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (edge || core) cells.push([ox + x, oy + y]);
    }
  };
  finder(0, 0);
  finder(18, 0);
  finder(0, 18);
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const inFinder = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16);
    if (!inFinder && next() % 100 < 48) cells.push([x, y]);
  }
  return cells;
};

// ---------------------------------------------------------------------------
// Відгук про роботу

function ReviewForm({ deal }: { deal: Deal }) {
  const [existing, setExisting] = useState<Review | null | undefined>(undefined);
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
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4d7a5e]">
          <Check className="size-4" />
          Дякуємо за відгук
        </p>
        <Stars value={existing.stars} />
        {existing.text && <p className="mt-1.5 text-[12px] leading-snug text-ink">{existing.text}</p>}
        <p className="pe-hint mt-1.5">Його побачать інші замовники в профілі виконавця.</p>
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
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати відгук.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deal-box">
      <p className="text-[14px] font-semibold text-ink">Як пройшла робота?</p>
      <p className="pe-hint">Оцінка й відгук потрапляють у профіль {deal.performer.name}. Їх бачать усі замовники.</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Оцінка" onMouseLeave={() => setHover(0)}>
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
      <textarea
        id={`review-${deal.id}`}
        ref={textRef}
        value={text}
        maxLength={REVIEW_TEXT_MAX}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Що сподобалось, що можна покращити (необов'язково)"
        className="auth-input mt-2 w-full resize-y py-2.5 leading-snug"
      />
      {error && (
        <p role="alert" className="auth-error mt-1">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={() => void submit()} className="offer-primary mt-2 w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Надіслати відгук
      </button>
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} з 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} width={size} height={size} className={index <= Math.round(value) ? "fill-brand text-brand" : "text-[#a7bcc0]"} />
      ))}
    </span>
  );
}
