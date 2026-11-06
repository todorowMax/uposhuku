// lib/deals/machine.ts
//
// Правила угоди: що можна з нею робити. Чисті функції без часу всередині:
// «зараз» передаємо ззовні, тож усе перевіряється тестами. Дії замовника й
// виконавця. Гроші безпечної угоди ці функції самі не рухають і «заморожено» чи «виплачено» не ставлять:
// вони лише записують намір (releasing, refunding), а підсумок приносить банк (lib/deals/payment-status.ts).

import {
  ESCROW_MAX_DAYS,
  HOLD_DAYS,
  HOLD_RESERVE_DAYS,
  MAX_DEAL,
  MAX_DIRECT_DEAL,
  MAX_STAGE_AMOUNT,
  MAX_STAGE_DAYS,
  MAX_STAGES,
  MIN_DEAL,
  type Deal,
  type DealAction,
  type DealDraft,
  type DealStage,
  type ModeratorAction,
  type PerformerAction,
  type StagePayout,
} from "./types";
import { COMMISSION_RATE } from "./price";

const iso = (ms: number) => new Date(ms).toISOString();

/** Відповідь на спробу створити безпечну угоду чи оплатити її, коли функція для людини вимкнена. */
export const SAFE_DEAL_UNAVAILABLE = "Безпечна угода ще недоступна";

/** Відповідь, коли просять змінити статус етапу ескроу словом: його змінює лише стан контракту (applyEscrowState). */
export const ESCROW_ONCHAIN = "Статус етапу ескроу змінює гаманець у блокчейні: зробіть дію в гаманці, і сайт оновить статус за станом контракту.";

export const dealTotal = (deal: Pick<Deal, "stages">) => deal.stages.reduce((sum, stage) => sum + stage.amount, 0);

/** Комісія безпечної угоди від ціни виконавця, у гривнях. Платить замовник понад ціну. */
export const feeOf = (amount: number, method: Deal["method"]) => (method === "safe" ? Math.round(amount * COMMISSION_RATE) : 0);

/** Виконавець отримує ціну повністю: комісії платформи й банку лягають на замовника, див. lib/deals/price.ts. */
export const payoutOf = (amount: number) => amount;

/** Ескроу в USDT: цілі долари на етап, сума угоди від 1 до стелі, вікно здачі в межах контракту. */
const validateEscrowDraft = (draft: DealDraft, escrowMax: number | null): string | null => {
  if (escrowMax === null) return "Ескроу ще недоступне.";
  for (const stage of draft.stages) {
    if (!stage.title.trim()) return "Назвіть кожен етап.";
    if (!Number.isInteger(stage.amount) || stage.amount < 1) return "Сума етапу ескроу: ціле число USDT, не менше 1.";
    if (!Number.isInteger(stage.days) || stage.days < 1 || stage.days > ESCROW_MAX_DAYS) return `Термін етапу від 1 до ${ESCROW_MAX_DAYS} днів.`;
  }
  const total = draft.stages.reduce((sum, stage) => sum + stage.amount, 0);
  if (total > escrowMax) return `Сума угоди ескроу не більша за ${escrowMax.toLocaleString("uk-UA")} USDT.`;
  return null;
};

/** Помилка у чернетці угоди або null. Текст — для людини. */
export const validateDraft = (draft: DealDraft, safeEnabled: boolean, escrowMax: number | null = null): string | null => {
  if (draft.stages.length < 1 || draft.stages.length > MAX_STAGES) return `Етапів має бути від 1 до ${MAX_STAGES}.`;
  if (draft.method === "escrow") return validateEscrowDraft(draft, escrowMax);
  if (draft.method === "safe" && !safeEnabled) return SAFE_DEAL_UNAVAILABLE;
  if (draft.method === "safe" && !draft.performer.fop) return "Безпечна угода доступна лише виконавцям-ФОП.";
  for (const stage of draft.stages) {
    if (!stage.title.trim()) return "Назвіть кожен етап.";
    if (!Number.isFinite(stage.amount) || stage.amount < 1) return "Вкажіть суму кожного етапу.";
    if (!Number.isFinite(stage.days) || stage.days < 1) return "Вкажіть термін кожного етапу в днях.";
    // Холд тримається до HOLD_DAYS днів, і частину лишаємо на перевірку й можливий спір: довший етап ділимо.
    if (draft.method === "safe" && stage.days > MAX_STAGE_DAYS) {
      return `Етап довший за ${MAX_STAGE_DAYS} днів: розділіть його. Холд триває ${HOLD_DAYS} днів, ${HOLD_RESERVE_DAYS} із них лишаємо на перевірку й можливий спір.`;
    }
    if (draft.method === "safe" && stage.amount > MAX_STAGE_AMOUNT) return `Етап безпечної угоди не більший за ${MAX_STAGE_AMOUNT.toLocaleString("uk-UA")} ₴: розділіть його.`;
  }
  const total = draft.stages.reduce((sum, stage) => sum + stage.amount, 0);
  const maxTotal = draft.method === "safe" ? MAX_DEAL : MAX_DIRECT_DEAL;
  if (total < MIN_DEAL || total > maxTotal) return `Сума угоди від ${MIN_DEAL} до ${maxTotal.toLocaleString("uk-UA")} ₴.`;
  return null;
};

/**
 * Розділити суму й термін на етапи так, щоб кожен вкладався в холд: для
 * довгої роботи — кілька етапів порівну, залишок копійок — в останньому.
 */
export const splitIntoStages = (amount: number, days: number, hold = MAX_STAGE_DAYS, cap = MAX_STAGE_AMOUNT): { title: string; amount: number; days: number }[] => {
  const count = Math.min(MAX_STAGES, Math.max(1, Math.ceil(days / hold), Math.ceil(amount / cap)));
  const baseAmount = Math.floor(amount / count);
  const baseDays = Math.floor(days / count);
  return Array.from({ length: count }, (_, index) => {
    const last = index === count - 1;
    return {
      title: count === 1 ? "Робота" : `Етап ${index + 1}`,
      amount: last ? amount - baseAmount * (count - 1) : baseAmount,
      days: last ? days - baseDays * (count - 1) : baseDays,
    };
  });
};

export const createDeal = (id: string, draft: DealDraft, now: number): Deal => ({
  id,
  requestId: draft.requestId,
  responseId: draft.responseId,
  performer: draft.performer,
  method: draft.method,
  ...(draft.method === "escrow" ? { currency: "USDT" as const } : {}),
  status: "proposed",
  createdAt: iso(now),
  number: `#${id.replace(/\W/g, "").slice(-4).toUpperCase()}`,
  ...(draft.title ? { title: draft.title.trim() } : {}),
  ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
  ...(draft.conversationId ? { conversationId: draft.conversationId } : {}),
  ...(draft.proposedBy ? { proposedBy: draft.proposedBy } : {}),
  stages: draft.stages.map((stage, index) => ({ id: `${id}-s${index + 1}`, ...stage, title: stage.title.trim(), status: "pending" })),
});

const revertPoint = (stage: DealStage): NonNullable<DealStage["revertTo"]> => (stage.status === "disputed" ? "disputed" : stage.status === "funded" ? "funded" : "delivered");

/** Етап переходить у releasing: гроші ще не виплачено, виплату виконає банк за цим наміром. */
const startPayout = (stage: DealStage, payout: StagePayout, now: number): DealStage => {
  const { payoutError: _error, ...rest } = stage;
  return { ...rest, status: "releasing", payout, releasingAt: iso(now), revertTo: revertPoint(stage) };
};

const startRefund = (stage: DealStage, reason: NonNullable<DealStage["refundReason"]>, now: number): DealStage => {
  const { payoutError: _error, ...rest } = stage;
  return { ...rest, status: "refunding", refundingAt: iso(now), refundReason: reason, revertTo: revertPoint(stage) };
};

/** Етап, на якому зараз угода: перший не виплачений. */
export const currentStage = (deal: Deal): DealStage | undefined => deal.stages.find((stage) => stage.status !== "released");

/** Замовник щось робить з угодою. Повертає нову угоду або текст помилки. */
export const applyAction = (deal: Deal, action: DealAction, stageId: string | undefined, now: number): Deal | string => {
  // Умови виставив виконавець: замовник їх приймає або відхиляє.
  if (action === "accept" || action === "decline") {
    if (deal.proposedBy !== "performer") return "Цю пропозицію приймає виконавець.";
    if (deal.status !== "proposed") return "Ця пропозиція вже не чекає на відповідь.";
    return action === "accept" ? { ...deal, status: "accepted", acceptedAt: iso(now) } : { ...deal, status: "declined" };
  }
  if (action === "cancel") {
    if (deal.proposedBy === "performer") return "Це пропозиція виконавця: її можна відхилити.";
    return deal.status === "proposed" ? { ...deal, status: "cancelled" } : "Скасувати можна лише ще не прийняту пропозицію.";
  }
  if (deal.status !== "accepted") return "Спершу виконавець має погодитися на угоду.";
  const stage = deal.stages.find((item) => item.id === (stageId ?? currentStage(deal)?.id));
  if (!stage) return "Етапу не знайдено.";
  // Етапи йдуть по черзі: наступний не починаємо, поки попередній не виплачено.
  const before = deal.stages.slice(0, deal.stages.indexOf(stage));
  if (before.some((item) => item.status !== "released")) return "Спершу завершіть попередній етап.";

  if (deal.method === "escrow" && (action === "fund" || action === "claim_paid" || action === "release" || action === "dispute")) return ESCROW_ONCHAIN;
  let updated: DealStage;
  switch (action) {
    case "fund":
      // «Заморожено» ставить лише банк (холд на рахунку), а не клік: оплата йде через POST /api/deals/:id/pay.
      return "Оплата безпечної угоди йде через сторінку банку: натисніть «Перейти до оплати».";
    case "claim_paid":
      if (deal.method !== "direct" || stage.status !== "pending") return "Позначити оплату зараз не можна.";
      updated = { ...stage, status: "claimed", claimedAt: iso(now) };
      break;
    case "release":
      if (stage.status === "releasing") return "Виплата вже виконується: банк підтвердить її найближчим часом.";
      if (stage.status !== "delivered") return "Виконавець ще не здав цей етап.";
      // Безпечна угода: «виплачено» ставить банк. Тут лише записуємо намір виплатити все.
      updated = deal.method === "safe" ? startPayout(stage, { kind: "full" }, now) : { ...stage, status: "released", releasedAt: iso(now) };
      break;
    case "dispute":
      if (stage.status !== "delivered" && stage.status !== "funded") return "Спір можна відкрити, коли кошти заморожено або етап здано.";
      if (deal.method === "direct") return "У прямому переказі гроші в нас не лежать, спір можна лише позначити в профілі.";
      updated = { ...stage, status: "disputed", disputedAt: iso(now) };
      break;
    default:
      return "Невідома дія.";
  }
  const stages = deal.stages.map((item) => (item.id === updated.id ? updated : item));
  const completed = stages.every((item) => item.status === "released");
  return { ...deal, stages, disputed: stages.some((item) => item.status === "disputed"), status: completed ? "completed" : deal.status };
};

/** Виконавець щось робить з угодою. Повертає нову угоду або текст помилки. */
export const applyPerformerAction = (deal: Deal, action: PerformerAction, stageId: string | undefined, now: number): Deal | string => {
  if (action === "withdraw") {
    if (deal.proposedBy !== "performer") return "Відкликати можна лише свою пропозицію.";
    return deal.status === "proposed" ? { ...deal, status: "cancelled" } : "Відкликати можна лише ще не прийняту пропозицію.";
  }
  if (action === "accept" || action === "decline") {
    if (deal.proposedBy === "performer") return "Це ваша пропозиція: відповідає замовник.";
    if (deal.status !== "proposed") return "Ця пропозиція вже не чекає на відповідь.";
    return action === "accept" ? { ...deal, status: "accepted", acceptedAt: iso(now) } : { ...deal, status: "declined" };
  }
  if (deal.status !== "accepted") return "Угода ще не прийнята.";
  const stage = deal.stages.find((item) => item.id === (stageId ?? currentStage(deal)?.id));
  if (!stage) return "Етапу не знайдено.";
  const before = deal.stages.slice(0, deal.stages.indexOf(stage));
  if (before.some((item) => item.status !== "released")) return "Спершу завершіть попередній етап.";
  if (deal.method === "escrow" && (action === "confirm_paid" || action === "deliver")) return ESCROW_ONCHAIN;
  let updated: DealStage;
  if (action === "confirm_paid") {
    if (deal.method !== "direct" || stage.status !== "claimed") return "Замовник ще не позначив оплату.";
    updated = { ...stage, status: "funded", fundedAt: iso(now) };
  } else if (action === "deliver") {
    if (stage.status !== "funded") return "Здати етап можна, коли оплату підтверджено.";
    updated = { ...stage, status: "delivered", deliveredAt: iso(now) };
  } else {
    return "Невідома дія.";
  }
  return { ...deal, stages: deal.stages.map((item) => (item.id === updated.id ? updated : item)) };
};

/** Етап, який зараз у спорі. */
export const disputedStage = (deal: Deal): DealStage | undefined => deal.stages.find((stage) => stage.status === "disputed");

/** Крок виплати частини: доля виконавця й платформи ріжуться на 20 частин (lib/deals/basket.ts). */
export const PARTIAL_STEP = 5;

/** Відсоток часткової виплати або текст помилки: кратний кроку, строго між 0 і 100. */
export const checkPartialPercent = (percent: unknown): number | string => {
  if (typeof percent !== "number" || !Number.isInteger(percent)) return "Вкажіть відсоток цілим числом.";
  if (percent <= 0 || percent >= 100 || percent % PARTIAL_STEP !== 0) return `Відсоток від ${PARTIAL_STEP} до ${100 - PARTIAL_STEP}, кратний ${PARTIAL_STEP}. Для повної виплати чи повернення оберіть інше рішення.`;
  return percent;
};

/** Додатковий вхід рішення модератора. `partial` потребує відсотка й явного підтвердження: виплата необоротна. */
export interface ModeratorOptions {
  percent?: number;
  confirm?: boolean;
}

const startPartial = (deal: Deal, stage: DealStage, options: ModeratorOptions, now: number): DealStage | string => {
  if (deal.method !== "safe") return "Часткова виплата можлива лише в безпечній угоді.";
  const percent = checkPartialPercent(options.percent);
  if (typeof percent === "string") return percent;
  if (options.confirm !== true) return "Часткова виплата необоротна: підтвердіть її окремо.";
  return startPayout(stage, { kind: "partial", percent }, now);
};

/** Банк тримає холд не довше HOLD_DAYS днів: коли він збіг, повертати роботу вже нема на чому. */
const startRework = (stage: DealStage, now: number): DealStage | string => {
  if (stage.holdUntil && Date.parse(stage.holdUntil) <= now) return "Холд уже збіг: оберіть виплату або повернення коштів.";
  const { deliveredAt: _delivered, ...rest } = stage;
  return { ...rest, status: "funded", reworkAt: iso(now) };
};

/**
 * Модератор вирішує спір на етапі. Рішення лише записує намір, гроші рухає банк, а підсумок
 * («виплачено», «повернено») приходить від нього:
 * - release: етап переходить у releasing (виплатити все);
 * - partial: releasing із відсотком; банк не дає повернути виплачену частину, тому потрібен confirm: true;
 * - refund: етап переходить у refunding, угоду закриє підтвердження банку;
 * - rework: етап повертається виконавцю на доопрацювання, холд лишається той самий, гроші не рухаються.
 */
export const applyModeratorAction = (deal: Deal, action: ModeratorAction, stageId: string | undefined, now: number, options: ModeratorOptions = {}): Deal | string => {
  if (deal.method === "escrow") return "Спір ескроу вирішує арбітр у блокчейні: див. адмінку (calldata для мультипідпису).";
  const stage = stageId ? deal.stages.find((item) => item.id === stageId) : disputedStage(deal);
  if (!stage || stage.status !== "disputed") return "Цей етап не в спорі.";
  let updated: DealStage;
  switch (action) {
    case "release":
      updated = deal.method === "safe" ? startPayout(stage, { kind: "full" }, now) : { ...stage, status: "released", releasedAt: iso(now) };
      break;
    case "partial": {
      const started = startPartial(deal, stage, options, now);
      if (typeof started === "string") return started;
      updated = started;
      break;
    }
    case "refund":
      updated = deal.method === "safe" ? startRefund(stage, "moderator", now) : { ...stage, status: "refunded", refundedAt: iso(now) };
      break;
    case "rework": {
      const reworked = startRework(stage, now);
      if (typeof reworked === "string") return reworked;
      updated = reworked;
      break;
    }
    default:
      return "Невідоме рішення.";
  }
  const stages = deal.stages.map((item) => (item.id === updated.id ? updated : item));
  const completed = stages.every((item) => item.status === "released");
  const status = updated.status === "refunded" ? "cancelled" : completed ? "completed" : deal.status;
  return { ...deal, stages, disputed: stages.some((item) => item.status === "disputed"), status };
};

/** Автоприймання: замовник мовчить після терміну перевірки, виплачуємо все. Лише безпечна угода, лише етап «здано». */
export const applyAutoAccept = (deal: Deal, stageId: string, now: number): Deal | string => {
  const stage = deal.stages.find((item) => item.id === stageId);
  if (deal.method !== "safe" || deal.status !== "accepted" || stage?.status !== "delivered") return "Автоприймання тут не застосовне.";
  const updated = { ...startPayout(stage, { kind: "full" }, now), autoAccepted: true };
  return { ...deal, stages: deal.stages.map((item) => (item.id === stageId ? updated : item)) };
};

/** Холд добігає кінця, а виконавець нічого не здав: скасовуємо холд, гроші повертаються замовнику (оферта, п. 9). */
export const applyHoldExpiryRefund = (deal: Deal, stageId: string, now: number): Deal | string => {
  const stage = deal.stages.find((item) => item.id === stageId);
  if (deal.method !== "safe" || deal.status !== "accepted" || stage?.status !== "funded") return "Скасування холду тут не застосовне.";
  return { ...deal, stages: deal.stages.map((item) => (item.id === stageId ? startRefund(stage, "hold_expiry", now) : item)) };
};

/** Чого від виконавця чекає угода зараз: для підказки й кнопок у його вхідних. */
export const performerNeeds = (deal: Deal): "answer" | "confirm" | "deliver" | null => {
  if (deal.status === "proposed") return deal.proposedBy === "performer" ? null : "answer";
  if (deal.status !== "accepted") return null;
  const stage = currentStage(deal);
  if (!stage) return null;
  if (stage.status === "claimed") return "confirm";
  if (stage.status === "funded") return "deliver";
  return null;
};

/** Для кроків у картці запиту: на якому етапі шляху угода. */
export type DealPhase = "none" | "negotiating" | "working" | "done";

export const dealPhase = (deals: Deal[]): DealPhase => {
  const live = deals.filter((deal) => deal.status !== "declined" && deal.status !== "cancelled");
  if (live.some((deal) => deal.status === "completed")) return "done";
  if (live.some((deal) => deal.status === "accepted")) return "working";
  return live.length > 0 ? "negotiating" : "none";
};

/** Чого від замовника чекає угода зараз: для крапки на вкладці й підказки. */
export const needsAction = (deal: Deal): "answer" | "fund" | "pay" | "confirm" | "dispute" | null => {
  if (deal.status === "proposed") return deal.proposedBy === "performer" ? "answer" : null;
  if (deal.status !== "accepted") return null;
  const stage = currentStage(deal);
  if (!stage) return null;
  if (stage.status === "disputed") return "dispute";
  if (stage.status === "pending") return deal.method === "direct" ? "pay" : "fund";
  if (stage.status === "delivered") return "confirm";
  return null;
};

/**
 * Банк однозначно відмовив у виплаті чи поверненні, гроші на місці: етап повертається туди, звідки пішов,
 * з текстом для людини. Без `releasing`/`refunding` нічого не робимо.
 */
export const revertPayout = (deal: Deal, stageId: string, message: string): Deal | string => {
  const stage = deal.stages.find((item) => item.id === stageId);
  if (!stage || (stage.status !== "releasing" && stage.status !== "refunding")) return "Етап уже не чекає виплати.";
  const { payout: _payout, releasingAt: _releasing, refundingAt: _refunding, refundReason: _reason, autoAccepted: _auto, attemptAt: _attempt, revertTo, ...rest } = stage;
  const back: DealStage = { ...rest, status: revertTo ?? "delivered", payoutError: message };
  const stages = deal.stages.map((item) => (item.id === stageId ? back : item));
  return { ...deal, stages, disputed: stages.some((item) => item.status === "disputed") };
};
