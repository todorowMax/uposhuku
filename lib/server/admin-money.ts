// lib/server/admin-money.ts
//
// Захист грошових рішень модератора: другий фактор (TOTP, секрет ADMIN_TOTP_SECRET) і лист власнику про кожне таке рішення.
// Грошові: виплата, повернення, часткова виплата безпечної угоди. «На доопрацювання» грошей не рухає й коду не потребує.
// На проді без секрету грошові рішення недоступні; поза продом без секрету код не питаємо (локальна розробка).

import { parseAdminEmails } from "@/lib/admin/access";
import { verifyTotp } from "@/lib/admin/totp";
import type { Deal, ModeratorAction } from "@/lib/deals/types";
import { isProduction, readVar } from "./env";
import { sendAdminNotice } from "./mail";
import { overLimit } from "./rate-limit";

const MONEY_ACTIONS: readonly ModeratorAction[] = ["release", "refund", "partial"];

/** Чи рухає це рішення гроші банку. */
export const isMoneyDecision = (deal: Deal, action: ModeratorAction): boolean => deal.method === "safe" && MONEY_ACTIONS.includes(action);

export type FactorResult = { ok: true } | { ok: false; status: number; title: string; detail: string };

/** Перевірка другого фактора перед грошовим рішенням. Кожна спроба рахується: код не підібрати перебором. */
export const checkSecondFactor = async (input: { adminId: string; code: unknown; now?: number }): Promise<FactorResult> => {
  const { adminId, code, now = Date.now() } = input;
  const secret = readVar("ADMIN_TOTP_SECRET");
  if (!secret) {
    return isProduction() ? { ok: false, status: 403, title: "Грошові рішення вимкнені", detail: "Не задано ADMIN_TOTP_SECRET: без другого фактора рішення з грошима недоступні." } : { ok: true };
  }
  if (await overLimit("adminTotp", adminId, now)) return { ok: false, status: 429, title: "Забагато спроб", detail: "Забагато спроб коду. Зачекайте кілька хвилин." };
  if (!(await verifyTotp({ secret, code, now }))) return { ok: false, status: 403, title: "Потрібен код другого фактора", detail: "Введіть поточний 6-значний код з автентифікатора." };
  return { ok: true };
};

const ACTION_LABEL: Record<ModeratorAction, string> = { release: "виплата виконавцю", refund: "повернення замовнику", partial: "часткова виплата", rework: "на доопрацювання" };

/** Лист власнику (ADMIN_EMAILS) про грошове рішення. Без персональних даних сторін: номер угоди, сума, хто вирішив. */
export const notifyMoneyDecision = async (input: { deal: Deal; action: ModeratorAction; stageAmount: number; adminEmail: string; percent?: number; bank: string }): Promise<void> => {
  const emails = parseAdminEmails(readVar("ADMIN_EMAILS"));
  if (emails.length === 0) return;
  const { deal, action, stageAmount, adminEmail, percent, bank } = input;
  const part = action === "partial" ? ` ${percent}%` : "";
  await sendAdminNotice(
    emails,
    `Грошове рішення за угодою ${deal.number}`,
    `Модератор ${adminEmail}: ${ACTION_LABEL[action]}${part}, етап на ${stageAmount} ₴ (угода ${deal.number}). Банк: ${bank}.`,
  );
};
