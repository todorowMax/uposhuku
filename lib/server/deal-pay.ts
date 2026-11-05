// lib/server/deal-pay.ts
//
// Оплата етапу безпечної угоди: рахунок Monobank з холдом на терміналі розщеплення. Створення рахунку проходить
// в такому порядку: перевірки → резерв платежу в БД (унікальний індекс не пускає другий одночасний) →
// виклик банку → запис id рахунку. Активний неоплачений рахунок використовується повторно, але лише після
// того, як банк підтвердив, що він ще живий.

import { buildBasket } from "@/lib/deals/basket";
import { currentStage } from "@/lib/deals/machine";
import { newAccountLimit } from "@/lib/deals/limits";
import { performerUserId } from "@/lib/deals/parties";
import { quoteStage } from "@/lib/deals/price";
import { createInvoice, MonobankError, terminalToken } from "@/lib/monobank/client";
import { logServer } from "@/lib/telemetry/log";
import { reconcilePayment } from "./deal-money";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "./db";
import { getDealForOwner } from "./deal-repo";
import { readVar } from "./env";
import { abandonReservation, activeStagePayment, attachInvoice, reserveDealPayment } from "./payment-repo";
import { freshReceiverId } from "./payout-repo";
import { safeDealEnabledFor } from "./safe-deal";

export type PayResult = { ok: true; pageUrl: string; reused: boolean } | { ok: false; status: number; title: string; detail: string };

const fail = (status: number, title: string, detail: string): PayResult => ({ ok: false, status, title, detail });

const BANK_DOWN = fail(502, "Банк не відповів", "Банк не відповів. Гроші не списано, спробуйте ще раз за хвилину.");

/** Платіж етапу, що вже існує: використати, якщо живий; зупинити, якщо гроші вже прийшли; null, якщо можна створювати новий. */
const existingPayment = async (dealId: string, stageId: string): Promise<PayResult | null> => {
  const payment = await activeStagePayment(dealId, stageId);
  if (!payment) return null;
  if (payment.status === "creating") return fail(409, "Рахунок створюється", "Рахунок на оплату вже створюється. Оновіть сторінку за мить.");
  if (payment.status === "hold" || payment.status === "success") return fail(409, "Оплату вже отримано", "Банк уже тримає кошти за цей етап. Оновіть сторінку.");
  try {
    // Банк мовчить про прострочені рахунки (вебхука на expired немає), тож питаємо його, перш ніж віддавати посилання.
    const state = await reconcilePayment(payment);
    if (state.bank.status === "created" || state.bank.status === "processing") return { ok: true, pageUrl: payment.pageUrl, reused: true };
    if (state.bank.status === "hold" || state.bank.status === "success") return fail(409, "Оплату вже отримано", "Банк уже тримає кошти за цей етап. Оновіть сторінку.");
    return null;
  } catch {
    return BANK_DOWN;
  }
};

/** Новий акаунт платить лише малі етапи: крадена картка не має шансу на велику суму. */
const accountLimit = async (userId: string, amount: number, now: number): Promise<string | null> => {
  const [account] = await getDb().select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  return account ? newAccountLimit({ createdAt: account.createdAt, amount, now }) : null;
};

export const startStagePayment = async (input: { user: { id: string; email: string }; dealId: string; origin: string; now?: number }): Promise<PayResult> => {
  const { user, dealId, origin, now = Date.now() } = input;
  if (!(await safeDealEnabledFor(user.email))) return fail(409, "Безпечна угода ще недоступна", "Безпечна угода ще недоступна.");
  const deal = await getDealForOwner(dealId, user.id);
  if (!deal) return fail(404, "Угоду не знайдено", "Угоду не знайдено.");
  if (deal.method !== "safe" || deal.status !== "accepted") return fail(409, "Оплата недоступна", "Оплатити можна лише прийняту безпечну угоду.");
  const stage = currentStage(deal);
  if (stage?.status !== "pending") return fail(409, "Оплата недоступна", "Цей етап зараз не чекає оплати.");

  const limited = await accountLimit(user.id, stage.amount, now);
  if (limited) return fail(409, "Ліміт для нового акаунта", limited);

  const performer = performerUserId(deal.performer.id);
  // Отримувача беремо зі свіжого списку банку: id сабмерчанта може змінитися, а в рахунку він фіксується в корзині.
  let receiverId: string | null;
  try {
    receiverId = performer ? await freshReceiverId(performer) : null;
  } catch {
    return BANK_DOWN;
  }
  if (!receiverId) return fail(409, "Виконавець не підключив виплати", "Виконавець ще не підключив виплати через банк. Оплатити безпечну угоду поки не можна.");
  const platformReceiver = readVar("MONOBANK_PLATFORM_RECEIVER_ID");
  if (!platformReceiver || !terminalToken("split")) return fail(503, "Оплата тимчасово недоступна", "Оплата тимчасово недоступна. Спробуйте трохи згодом.");

  const reused = await existingPayment(deal.id, stage.id);
  if (reused) return reused;

  const quote = quoteStage(stage.amount);
  const basket = buildBasket(quote, { performer: receiverId, platform: platformReceiver });
  const reservation = await reserveDealPayment({ dealId: deal.id, stageId: stage.id, provider: "monobank", card: quote.card, amount: quote.total, basket });
  if (!reservation) return fail(409, "Рахунок створюється", "Рахунок на оплату вже створюється. Оновіть сторінку за мить.");
  try {
    const invoice = await createInvoice({
      terminal: "split",
      amount: quote.total,
      hold: true,
      reference: reservation.id,
      destination: `Угода ${deal.number}: ${stage.title}`.slice(0, 120),
      webHookUrl: `${origin}/api/monobank/webhook`,
      redirectUrl: `${origin}/?open=inbox&paid=${encodeURIComponent(deal.id)}`,
      basketOrder: basket,
    });
    await attachInvoice(reservation.id, invoice);
    return { ok: true, pageUrl: invoice.pageUrl, reused: false };
  } catch (error) {
    logServer({ level: "error", event: "deal_invoice_failed", message: error instanceof Error ? error.message : String(error), detail: { dealId: deal.id, stageId: stage.id } });
    // Однозначна відмова банку звільняє етап одразу. Після мережевого збою невідомо, чи рахунок створено:
    // резерв лишається, а sweep зніме його за 15 хвилин, і за `reference` вебхук усе одно знайде платіж.
    if (error instanceof MonobankError) await abandonReservation(reservation.id);
    return BANK_DOWN;
  }
};
