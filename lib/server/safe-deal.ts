// lib/server/safe-deal.ts
//
// Рішення про безпечну угоду на сервері: тонка обгортка над прапорцем `safe_deal` (lib/server/features.ts).
// Нові оплати й нові угоди питають тут; гроші, що вже в русі (вебхук, звірка, виплата), режиму не питають.

import type { FeatureMode } from "@/lib/features/flags";
import { featureEnabledFor, featureMode } from "./features";

export const safeDealMode = (): Promise<FeatureMode> => featureMode("safe_deal");

/** Чи може ця людина створювати безпечні угоди й оплачувати їх. */
export const safeDealEnabledFor = (email: string | null | undefined): Promise<boolean> => featureEnabledFor("safe_deal", email);

/** Юридичні тексти показують безпечну угоду лише в режимі `on`. */
export const safeDealPublic = async (): Promise<boolean> => (await safeDealMode()) === "on";
