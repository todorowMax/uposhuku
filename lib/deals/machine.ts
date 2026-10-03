// lib/deals/machine.ts
//
// Правила угоди: що можна з нею робити. Чисті функції без часу всередині:
// «зараз» передаємо ззовні, тож усе перевіряється тестами. Дії замовника й
// виконавця; гроші підтверджуватиме вебхук банку.

import { HOLD_DAYS, MAX_DEAL, MAX_STAGES, MIN_DEAL, SAFE_FEE, type Deal, type DealAction, type DealDraft, type DealStage, type PerformerAction } from "./types";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export const dealTotal = (deal: Pick<Deal, "stages">) => deal.stages.reduce((sum, stage) => sum + stage.amount, 0);

/** Комісія платформи з суми: лише для безпечної угоди, у гривнях. */
export const feeOf = (amount: number, method: Deal["method"]) => (method === "safe" ? Math.round(amount * SAFE_FEE) : 0);

export const payoutOf = (amount: number, method: Deal["method"]) => amount - feeOf(amount, method);

/** Помилка у чернетці угоди або null. Текст — для людини. */
export const validateDraft = (draft: DealDraft): string | null => {
  if (draft.stages.length < 1 || draft.stages.length > MAX_STAGES) return `Етапів має бути від 1 до ${MAX_STAGES}.`;
  if (draft.method === "safe" && !draft.performer.fop) return "Безпечна угода доступна лише виконавцям-ФОП.";
  if (draft.method === "direct" && draft.stages.length !== 1) return "Прямий переказ іде одним платежем.";
  for (const stage of draft.stages) {
    if (!stage.title.trim()) return "Назвіть кожен етап.";
    if (!Number.isFinite(stage.amount) || stage.amount < 1) return "Вкажіть суму кожного етапу.";
    if (!Number.isFinite(stage.days) || stage.days < 1) return "Вкажіть термін кожного етапу в днях.";
    // Холд тримається до 9 днів: довший етап банк не втримає, його треба ділити.
    if (draft.method === "safe" && stage.days > HOLD_DAYS) return `Етап довший за ${HOLD_DAYS} днів: розділіть його, холд триває до ${HOLD_DAYS} днів.`;
  }
  const total = draft.stages.reduce((sum, stage) => sum + stage.amount, 0);
  if (total < MIN_DEAL || total > MAX_DEAL) return `Сума угоди від ${MIN_DEAL} до ${MAX_DEAL} ₴.`;
  return null;
};

/**
 * Розділити суму й термін на етапи так, щоб кожен вкладався в холд: для
 * довгої роботи — кілька етапів порівну, залишок копійок — в останньому.
 */
export const splitIntoStages = (amount: number, days: number, hold = HOLD_DAYS): { title: string; amount: number; days: number }[] => {
  const count = Math.min(MAX_STAGES, Math.max(1, Math.ceil(days / hold)));
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
  status: "proposed",
  createdAt: iso(now),
  number: `#${id.replace(/\W/g, "").slice(-4).toUpperCase()}`,
  stages: draft.stages.map((stage, index) => ({ id: `${id}-s${index + 1}`, ...stage, title: stage.title.trim(), status: "pending" })),
});

/** Етап, на якому зараз угода: перший не виплачений. */
export const currentStage = (deal: Deal): DealStage | undefined => deal.stages.find((stage) => stage.status !== "released");

/** Замовник щось робить з угодою. Повертає нову угоду або текст помилки. */
export const applyAction = (deal: Deal, action: DealAction, stageId: string | undefined, now: number): Deal | string => {
  if (action === "cancel") {
    return deal.status === "proposed" ? { ...deal, status: "cancelled" } : "Скасувати можна лише ще не прийняту пропозицію.";
  }
  if (deal.status !== "accepted") return "Спершу виконавець має погодитися на угоду.";
  const stage = deal.stages.find((item) => item.id === (stageId ?? currentStage(deal)?.id));
  if (!stage) return "Етапу не знайдено.";
  // Етапи йдуть по черзі: наступний не починаємо, поки попередній не виплачено.
  const before = deal.stages.slice(0, deal.stages.indexOf(stage));
  if (before.some((item) => item.status !== "released")) return "Спершу завершіть попередній етап.";

  let updated: DealStage;
  switch (action) {
    case "fund":
      if (deal.method !== "safe" || stage.status !== "pending") return "Заморозити кошти зараз не можна.";
      updated = { ...stage, status: "funded", fundedAt: iso(now), holdUntil: iso(now + HOLD_DAYS * DAY) };
      break;
    case "claim_paid":
      if (deal.method !== "direct" || stage.status !== "pending") return "Позначити оплату зараз не можна.";
      updated = { ...stage, status: "claimed", claimedAt: iso(now) };
      break;
    case "release":
      if (stage.status !== "delivered") return "Виконавець ще не здав цей етап.";
      updated = { ...stage, status: "released", releasedAt: iso(now) };
      break;
    case "dispute":
      if (stage.status !== "delivered" && stage.status !== "funded") return "Спір можна відкрити, коли кошти заморожено або етап здано.";
      if (deal.method === "direct") return "У прямому переказі гроші в нас не лежать, спір можна лише позначити в профілі.";
      updated = { ...stage, status: "disputed" };
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
  if (action === "accept" || action === "decline") {
    if (deal.status !== "proposed") return "Ця пропозиція вже не чекає на відповідь.";
    return action === "accept" ? { ...deal, status: "accepted", acceptedAt: iso(now) } : { ...deal, status: "declined" };
  }
  if (deal.status !== "accepted") return "Угода ще не прийнята.";
  const stage = deal.stages.find((item) => item.id === (stageId ?? currentStage(deal)?.id));
  if (!stage) return "Етапу не знайдено.";
  const before = deal.stages.slice(0, deal.stages.indexOf(stage));
  if (before.some((item) => item.status !== "released")) return "Спершу завершіть попередній етап.";
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

/** Чого від виконавця чекає угода зараз: для підказки й кнопок у його вхідних. */
export const performerNeeds = (deal: Deal): "answer" | "confirm" | "deliver" | null => {
  if (deal.status === "proposed") return "answer";
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
export const needsAction = (deal: Deal): "fund" | "pay" | "confirm" | "dispute" | null => {
  if (deal.status !== "accepted") return null;
  const stage = currentStage(deal);
  if (!stage) return null;
  if (stage.status === "disputed") return "dispute";
  if (stage.status === "pending") return deal.method === "safe" ? "fund" : "pay";
  if (stage.status === "delivered") return "confirm";
  return null;
};
