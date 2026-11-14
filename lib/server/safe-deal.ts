// lib/server/safe-deal.ts
//
// Рішення про безпечну угоду на сервері: тонка обгортка над прапорцем `safe_deal` (lib/server/features.ts).
// Нові оплати й нові угоди питають тут; гроші, що вже в русі (вебхук, звірка, виплата), режиму не питають.

import type { FeatureMode } from "@/lib/features/flags";
import type { LegalFlags } from "@/lib/legal/types";
import { featureEnabledFor, featureMode } from "./features";

export const safeDealMode = (): Promise<FeatureMode> => featureMode("safe_deal");

/** Чи може ця людина створювати безпечні угоди й оплачувати їх. */
export const safeDealEnabledFor = (email: string | null | undefined): Promise<boolean> => featureEnabledFor("safe_deal", email);

/** Юридичні тексти показують безпечну угоду лише в режимі `on`. */
export const safeDealPublic = async (): Promise<boolean> => (await safeDealMode()) === "on";

/** Крипто-функції (USDT за хешем, оплата з гаманця, ескроу) видно в юридичних текстах, коли будь-яка з них у режимі `on`. */
export const cryptoPublic = async (): Promise<boolean> => {
  const modes = await Promise.all([featureMode("crypto_proof"), featureMode("crypto_wallet"), featureMode("crypto_escrow")]);
  return modes.some((mode) => mode === "on");
};

/** Підтвердження телефона видно в політиці, коли `phone_verify` у режимі `on`. */
export const phonePublic = async (): Promise<boolean> => (await featureMode("phone_verify")) === "on";

/** Що з функцій показувати в умовах і політиці. */
export const legalFlags = async (): Promise<LegalFlags> => {
  const [safeDeal, crypto, phone] = await Promise.all([safeDealPublic(), cryptoPublic(), phonePublic()]);
  return { safeDeal, crypto, phone };
};
