"use client";

// components/deals/deal-screen/parts/escrow-screen.tsx
//
// Ескроу USDT на екрані: що відбувається з етапом і дії сторони, підключення гаманця (панель з wagmi
// підтягується динамічно лише тут).

import { Screen } from "@/components/ui/screen";
import { EscrowSection } from "@/components/wallet/escrow-section";
import type { EscrowRole } from "@/lib/crypto/escrow-ui";
import type { Deal, DealStage } from "@/lib/deals/types";

export const EscrowScreen = ({ deal, stage, side, onOpenChange, onChanged }: { deal: Deal; stage: DealStage; side: EscrowRole; onOpenChange: (open: boolean) => void; onChanged: () => void }) => (
  <Screen open onOpenChange={onOpenChange} title="Ескроу USDT" desktop="panel">
    <div className="deal">
      <EscrowSection deal={deal} stage={stage} side={side} onChanged={onChanged} />
    </div>
  </Screen>
);
