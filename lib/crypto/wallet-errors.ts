// lib/crypto/wallet-errors.ts
//
// Тексти для людини за помилками гаманця (viem і wagmi). Помилки вкладені (`cause`), тож шукаємо за іменем
// і кодом по всьому ланцюжку. Чиста функція: нічого не читає й не пише.

const BY_NAME: Record<string, string> = {
  UserRejectedRequestError: "Ви відхилили запит у гаманці. Нічого не списано: можна спробувати ще раз.",
  SwitchChainError: "Гаманець не переключився на потрібну мережу. Переключіть її вручну в гаманці.",
  ChainMismatchError: "Гаманець у іншій мережі. Переключіть його на мережу оплати.",
  ChainNotConfiguredError: "Гаманець у мережі, яку сайт не підтримує. Переключіть його на мережу оплати.",
  ConnectorNotConnectedError: "Гаманець відʼєднався посеред операції. Підключіть його знову й повторіть: якщо транзакцію вже відправлено, перевірте її в гаманці.",
  ConnectorAccountNotFoundError: "Гаманець більше не віддає акаунт. Підключіть його знову.",
  WalletTimeoutError: "Гаманець не відповів за хвилину. Перевірте, що він встановлений і розблокований, і спробуйте ще раз.",
  ConnectorNotFoundError: "Гаманець не знайдено. Встановіть розширення чи відкрийте сайт у браузері гаманця.",
  InsufficientFundsError: "Не вистачає коштів на газ (комісію мережі). Поповніть баланс мережі й повторіть.",
  WaitForTransactionReceiptTimeoutError: "Мережа довго не підтверджує транзакцію. Не відправляйте платіж вдруге: перевірте її в гаманці й вставте хеш пізніше.",
  TransactionReceiptNotFoundError: "Мережа ще не знайшла транзакцію. Зачекайте й перевірте її в гаманці.",
  TransactionNotFoundError: "Транзакцію не знайдено: її могли скасувати чи замінити в гаманці.",
};

const BY_MESSAGE: [RegExp, string][] = [
  [/insufficient funds|gas required exceeds|exceeds the balance/i, "Не вистачає коштів на газ (комісію мережі). Поповніть баланс мережі й повторіть."],
  [/transfer amount exceeds balance|exceeds balance|insufficient balance/i, "На гаманці не вистачає USDT для цього платежу."],
  [/TooLate/i, "Строк здачі вже минув: етап можна лише завершити за таймером або відкрити спір."],
  [/TooEarly/i, "Ще рано: потрібний строк у контракті не минув."],
  [/NotClient|NotPerformer|NotParty/i, "Ця дія доступна іншій стороні угоди. Підключіть гаманець, з яким ви в угоді."],
  [/WrongState/i, "Стан контракту вже змінився: оновіть угоду."],
  [/InvalidDeadline|InvalidReviewPeriod|InvalidAmount/i, "Контракт відхилив умови етапу (сума чи строки поза лімітами)."],
  [/user rejected|user denied|rejected the request/i, "Ви відхилили запит у гаманці. Нічого не списано: можна спробувати ще раз."],
  [/replaced|cancelled|canceled/i, "Транзакцію скасовано або замінено в гаманці. Якщо гроші не списано, повторіть платіж."],
];

const FALLBACK = "Гаманець повернув помилку. Перевірте його й спробуйте ще раз.";

const chain = (error: unknown): { name?: string; code?: unknown; message?: string }[] => {
  const out: { name?: string; code?: unknown; message?: string }[] = [];
  let current: unknown = error;
  while (current && typeof current === "object" && out.length < 8) {
    const item = current as { name?: string; code?: unknown; shortMessage?: string; message?: string; cause?: unknown };
    out.push({ name: item.name, code: item.code, message: item.shortMessage ?? item.message });
    current = item.cause;
  }
  return out;
};

/** Текст українською для будь-якої помилки гаманця. */
export const walletErrorText = (error: unknown): string => {
  const links = chain(error);
  for (const link of links) {
    if (link.code === 4001) return BY_NAME.UserRejectedRequestError;
    if (link.name && BY_NAME[link.name]) return BY_NAME[link.name];
  }
  for (const link of links) {
    const hit = BY_MESSAGE.find(([pattern]) => link.message && pattern.test(link.message));
    if (hit) return hit[1];
  }
  return FALLBACK;
};
