// lib/server/safe-deal.ts
//
// Рішення про безпечну угоду на сервері: режим і список пошт беремо зі змінних середовища.
// Нові оплати й нові угоди питають тут; гроші, що вже в русі (вебхук, звірка, виплата), режиму не питають.

import { parseSafeDealMode, parseSafeDealUsers, safeDealAllowed, type SafeDealMode } from "@/lib/deals/flags";
import { readVar } from "./env";

export const safeDealMode = (): SafeDealMode => parseSafeDealMode(readVar("SAFE_DEAL_MODE"));

/** Чи може ця людина створювати безпечні угоди й оплачувати їх. */
export const safeDealEnabledFor = (email: string | null | undefined): boolean => safeDealAllowed(safeDealMode(), parseSafeDealUsers(readVar("SAFE_DEAL_USERS")), email);

/** Юридичні тексти показують безпечну угоду лише в режимі `on`. */
export const safeDealPublic = (): boolean => safeDealMode() === "on";
