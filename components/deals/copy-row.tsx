"use client";

// components/deals/copy-row.tsx
//
// Рядок «назва, значення, кнопка Копіювати» для реквізитів. Підтвердження копіювання читає екранний диктор.

import { Button } from "@/components/ui/button";

export const CopyRow = ({ label, value, shown, copied, onCopy }: { label: string; value: string; shown?: string; copied: boolean; onCopy: () => void }) => {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="break-all font-medium tabular-nums text-ink">{shown ?? value}</dd>
      </div>
      <Button variant="link" onClick={onCopy} aria-label={`Копіювати: ${label}`} className="shrink-0 py-1 text-xs">
        {copied ? "Скопійовано" : "Копіювати"}
      </Button>
    </div>
  );
};
