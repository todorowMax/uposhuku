// lib/server/escrow-gate.ts
//
// Чи можна створити угоду ескроу: прапорець `crypto_escrow` у того, хто створює, адреса фабрики, підтверджений адрес
// гаманця виконавця. Повертає стелю угоди в USDT (CRYPTO_MAX_DEAL_USDT, але не вище ліміту фабрики, який читаємо з
// контракту) або текст відмови для людини.

import { EvmUnavailableError } from "@/lib/crypto/evm";
import { readFactoryTerms } from "@/lib/crypto/escrow-chain";
import { USDT_DECIMALS } from "@/lib/crypto/units";
import { escrowCap, escrowConfigFor } from "./crypto-config";
import { getOwnRequisites } from "./requisites-repo";

const UNIT = 10n ** BigInt(USDT_DECIMALS);

export const escrowGate = async (input: { email: string | null | undefined; performerUserId: string | null }): Promise<{ max: number } | string> => {
  const config = await escrowConfigFor(input.email);
  if (!config?.factory) return "Ескроу ще недоступне для вашого акаунта.";
  if (!input.performerUserId) return "Ескроу можливе лише з виконавцем-акаунтом.";
  const wallet = (await getOwnRequisites(input.performerUserId)).requisites?.walletAddress;
  if (!wallet) return "Виконавець ще не підтвердив адресу гаманця: ескроу без неї неможливе.";
  try {
    const terms = await readFactoryTerms({ rpcUrl: config.rpcUrl, factory: config.factory });
    const limit = Number(terms.maxAmount / UNIT);
    return { max: Math.min(escrowCap(), limit) };
  } catch (error) {
    if (error instanceof EvmUnavailableError) return "Не вдалося звірити ліміт з контрактом: спробуйте пізніше.";
    throw error;
  }
};
