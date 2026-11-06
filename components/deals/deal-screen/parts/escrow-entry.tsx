"use client";

// components/deals/deal-screen/parts/escrow-entry.tsx
//
// Етап ескроу в екрані угоди: одна кнопка, що відкриває екран ескроу (там гаманець і дії).

import { Button } from "@/components/ui/button";
import type { DealStage } from "@/lib/deals/types";

export const EscrowEntry = ({ stage, onOpen }: { stage: DealStage; onOpen: () => void }) => (
  <div className="mt-2 grid gap-2">
    <p className="pe-hint">Ескроу USDT · {stage.amount} USDT</p>
    <Button variant="secondary" onClick={onOpen} className="w-auto px-4">
      Відкрити ескроу
    </Button>
  </div>
);
