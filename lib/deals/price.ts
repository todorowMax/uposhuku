// lib/deals/price.ts
//
// «До оплати» для безпечної угоди. Виконавець називає ціну (скажімо, 10 000 ₴), і
// вона йде йому повністю. Замовник платить більше: ціна + винагорода платформи
// (SAFE_FEE від ціни) + комісія банку за приймання платежу. Комісію банку банк
// рахує від усієї суми платежу, тож вона залежить від самої суми і від типа
// картки (1,3% українські, 2% закордонні): total = (ціна + винагорода) / (1 − ставка).
// Усі суми тут у копійках, щоб не накопичувати похибку. Чисті функції без часу.

import { ACQUIRING_RATE, SAFE_FEE, type CardKind, type StagePayment } from "./types";

const KOP = 100;

/**
 * Розбивка оплати етапу. Ціну беремо в гривнях, як її називають сторони.
 * Комісію банку округлюємо вгору на користь виконавця, щоб після її утримання
 * банком він не лишився з меншою за ціну сумою.
 */
export const quoteStage = (priceUah: number, card: CardKind): StagePayment => {
  const price = Math.round(priceUah * KOP);
  const fee = Math.round(price * SAFE_FEE);
  const total = Math.ceil((price + fee) / (1 - ACQUIRING_RATE[card]));
  return { card, price, fee, bankFee: total - price - fee, total };
};

/**
 * Частки розщеплення. Банк утримує свою комісію з частки виконавця (відповідь
 * банку від 22.10.2026: ФОП отримав 98,7 ₴ зі 100 ₴), тож частка виконавця в
 * рахунку включає комісію банку, а після її утримання лишається рівно ціна.
 * Припущення про те, з чиєї частки банк утримує комісію, перевіряємо на тестовому токені.
 */
export const splitShares = (payment: StagePayment): { performer: number; platform: number } => ({
  performer: payment.price + payment.bankFee,
  platform: payment.fee,
});

/** Скільки заплатить замовник за кілька етапів, якщо картка українська й якщо закордонна. */
export const totalRange = (pricesUah: number[]): { ua: number; foreign: number } => ({
  ua: pricesUah.reduce((sum, price) => sum + quoteStage(price, "ua").total, 0),
  foreign: pricesUah.reduce((sum, price) => sum + quoteStage(price, "foreign").total, 0),
});

const WHOLE = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Копійки як «10 638,30 ₴»; цілі гривні без копійок. */
export const formatKop = (kop: number): string => `${kop % KOP === 0 ? WHOLE.format(kop / KOP) : CENTS.format(kop / KOP)} ₴`;

/** Ставка банку для підписів: «1,3%», «2%». */
export const rateLabel = (card: CardKind): string => `${String(+(ACQUIRING_RATE[card] * 100).toFixed(1)).replace(".", ",")}%`;
