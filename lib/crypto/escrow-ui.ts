// lib/crypto/escrow-ui.ts
//
// Які кнопки ескроу бачить сторона на етапі. Чиста функція: «зараз» (секунди) передають ззовні. Сайт лише
// показує кнопки; чи дозволена дія, вирішує контракт, а статус етапу ставить звірка зі станом контракту.

import type { DealStage } from "@/lib/deals/types";

export type EscrowRole = "customer" | "performer";

export interface EscrowButtons {
  /** Замовник вносить кошти (етап ще не внесено). */
  deposit: boolean;
  /** Виконавець здає етап. */
  deliver: boolean;
  /** Замовник приймає роботу. */
  release: boolean;
  /** Будь-яка сторона відкриває спір. */
  dispute: boolean;
  /** Завершення за таймером (settle): «Повернути кошти» без здачі після строку, «Забрати кошти» після перевірки. Може будь-хто. */
  settle: "refund" | "claim" | null;
}

const NONE: EscrowButtons = { deposit: false, deliver: false, release: false, dispute: false, settle: null };

export const SETTLE_LABEL = { refund: "Повернути кошти", claim: "Забрати кошти" } as const;

const secondsOf = (iso: string | undefined): number | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

/** Кнопки для ролі на етапі. Строки беруться зі стану контракту, збереженого в етапі. */
export const escrowButtons = (input: { role: EscrowRole; stage: Pick<DealStage, "status" | "deliverBy" | "reviewEnds">; nowSeconds: number }): EscrowButtons => {
  const { role, stage, nowSeconds } = input;
  const deliverBy = secondsOf(stage.deliverBy);
  const reviewEnds = secondsOf(stage.reviewEnds);
  switch (stage.status) {
    case "pending":
    case "claimed":
      return { ...NONE, deposit: role === "customer" };
    case "funded": {
      const late = deliverBy !== null && nowSeconds > deliverBy;
      return { ...NONE, deliver: role === "performer" && !late, dispute: true, settle: late ? "refund" : null };
    }
    case "delivered": {
      const reviewed = reviewEnds !== null && nowSeconds > reviewEnds;
      return { ...NONE, release: role === "customer", dispute: true, settle: reviewed ? "claim" : null };
    }
    default:
      return NONE;
  }
};
