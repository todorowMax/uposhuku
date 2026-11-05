// lib/deals/nbu-qr.ts
//
// Посилання для QR-коду платежу за форматом НБУ (версія 002). Уся логіка формату тут, щоб його можна було
// поправити в одному місці. УВАГА: першоджерело специфікації прочитати не вдалося. Кодування `2`, порожні
// рядки й base64url взято з вторинних даних, сканування в банківських застосунках НЕ перевірено.
// Тому поруч із кодом завжди є копіювання реквізитів: QR не єдиний шлях.

export interface NbuQrInput {
  recipient: string;
  iban: string;
  taxCode: string;
  /** Сума в гривнях. */
  amount: number;
  purpose: string;
}

// Показ коду керує прапорець `nbu_qr` (lib/features/flags.ts): його вмикають, коли сканування перевірено в банках.

export const NBU_QR_BASE = "https://bank.gov.ua/qr/";

/** Рядки в рамках одного поля не можуть містити переводів рядка: вони розділяють поля. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** Суми з двома знаками після крапки: UAH1500.00. */
export const formatQrAmount = (amount: number): string => `UAH${amount.toFixed(2)}`;

/** Рядки пакета за порядком: BCD, 002, кодування, UCT, BIC (порожній), одержувач, IBAN, сума, код, два порожні, призначення. */
export const nbuQrLines = (input: NbuQrInput): string[] => [
  "BCD",
  "002",
  "2",
  "UCT",
  "",
  oneLine(input.recipient),
  input.iban.replace(/\s/g, "").toUpperCase(),
  formatQrAmount(input.amount),
  input.taxCode.replace(/\s/g, ""),
  "",
  "",
  oneLine(input.purpose),
];

/** base64url (без `=`) від UTF-8 байтів. Працює в браузері, Node і Workers. */
const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Те, що кодується в QR: посилання НБУ з упакованими рядками. */
export const nbuQrLink = (input: NbuQrInput): string => `${NBU_QR_BASE}${toBase64Url(nbuQrLines(input).join("\n"))}`;
