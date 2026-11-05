// lib/deals/price.ts
//
// «До оплати» для безпечної угоди. Виконавець називає ціну (скажімо, 10 000 ₴), і вона йде йому повністю.
// Замовник платить ціну плюс одну комісію COMMISSION_RATE зверху; ділення на сервіс і банк видно лише
// в розщепленні (splitShares). Усі суми тут у копійках, щоб не накопичувати похибку. Чисті функції без часу.

import type { CardKind, StagePayment } from "./types";

const KOP = 100;

/** Комісія за безпечну угоду: одна ставка від ціни, зверху. Замовник платить ціну + комісію, виконавець отримує ціну повністю. */
export const COMMISSION_RATE = 0.07;
/** Резерв на комісію банку: частка від суми платежу, яку кладемо в частку виконавця, щоб після утримання банком лишилась ціна. */
export const BANK_RESERVE_RATE = 0.02;

/** Ранні платежі (card = ua | foreign) рахувалися за іншою моделлю; їх звіряємо за нею, доки вони живі. */
const LEGACY_FEE = 0.05;
const LEGACY_ACQUIRING_RATE = { ua: 0.013, foreign: 0.02 } as const;

/**
 * Розбивка оплати етапу. Ціну беремо в гривнях, як її називають сторони. Нова модель (`any`): total = ціна + 7%.
 * Платежі зі старою моделлю (`ua`, `foreign`) рахуються за колишньою формулою, щоб звірка суми з банком
 * лишалася правильною для рахунків, створених до зміни.
 */
export const quoteStage = (priceUah: number, card: CardKind = "any"): StagePayment => {
  const price = Math.round(priceUah * KOP);
  if (card === "any") {
    const fee = Math.round(price * COMMISSION_RATE);
    return { card, price, fee, bankFee: 0, total: price + fee };
  }
  const fee = Math.round(price * LEGACY_FEE);
  const total = Math.ceil((price + fee) / (1 - LEGACY_ACQUIRING_RATE[card]));
  return { card, price, fee, bankFee: total - price - fee, total };
};

/**
 * Частки розщеплення: єдине місце, яке зміниться після відповіді банку про те, з чиєї частки він утримує комісію.
 * Припущення: банк утримує її з частки виконавця (відповідь банку від 22.10.2026), тож частка виконавця =
 * ціна + резерв банку (BANK_RESERVE_RATE від суми платежу, округлено вгору), а наша = решта.
 * Для старих платежів резерв дорівнює записаній комісії банку.
 */
export const splitShares = (payment: StagePayment): { performer: number; platform: number } => {
  const reserve = payment.card === "any" ? Math.ceil(payment.total * BANK_RESERVE_RATE) : payment.bankFee;
  const performer = payment.price + reserve;
  return { performer, platform: payment.total - performer };
};

/** Скільки заплатить замовник за кілька етапів. */
export const totalOf = (pricesUah: number[]): number => pricesUah.reduce((sum, price) => sum + quoteStage(price).total, 0);

const WHOLE = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Копійки як «10 638,30 ₴»; цілі гривні без копійок. */
export const formatKop = (kop: number): string => `${kop % KOP === 0 ? WHOLE.format(kop / KOP) : CENTS.format(kop / KOP)} ₴`;
