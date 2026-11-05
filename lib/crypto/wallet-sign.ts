// lib/crypto/wallet-sign.ts
//
// Підтвердження адреси виконавця підписом гаманця. Повідомлення містить домен, адресу, одноразовий код і строк:
// підпис не можна використати на іншому сайті чи повторно. Сервер перевіряє його через viem (звичайні гаманці,
// ключ яких є в самому гаманці; контрактні гаманці з ERC-1271 тут не підтримуються).

import { verifyMessage, type Address } from "viem";

/** Скільки діє запит на підпис. */
export const WALLET_CHALLENGE_TTL_MS = 10 * 60_000;

export interface WalletMessageInput {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

/** Текст, який людина бачить у гаманці й підписує. Сервер збирає його самотужки з рядка запиту в базі. */
export const buildWalletMessage = ({ domain, address, nonce, issuedAt, expiresAt }: WalletMessageInput): string =>
  [
    `${domain} просить підтвердити адресу гаманця для отримання USDT.`,
    "",
    `Адреса: ${address}`,
    `Домен: ${domain}`,
    `Код: ${nonce}`,
    `Видано: ${new Date(issuedAt).toISOString()}`,
    `Діє до: ${new Date(expiresAt).toISOString()}`,
    "",
    "Підпис не відправляє транзакцій і не дає доступу до коштів.",
  ].join("\n");

/** Чи підписано повідомлення саме цією адресою. Нечинний підпис це false, а не помилка. */
export const isWalletSignatureValid = async (input: { address: Address; message: string; signature: string }): Promise<boolean> => {
  const { address, message, signature } = input;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
  try {
    return await verifyMessage({ address, message, signature: signature as `0x${string}` });
  } catch {
    return false;
  }
};
