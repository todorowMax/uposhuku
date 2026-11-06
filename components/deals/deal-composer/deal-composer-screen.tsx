"use client";

// components/deals/deal-composer/deal-composer-screen.tsx
//
// «Запропонувати угоду» за відгуком на екрані: поля одним стовпцем, унизу кнопка й помилка сервера.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import type { Deal } from "@/lib/deals/types";
import type { OfferResponse } from "@/lib/requests/types";
import { DealComposer } from "./deal-composer";
import { useDealComposer } from "./use-deal-composer";

export const DealComposerScreen = ({ response, onOpenChange, onDone }: { response: OfferResponse; onOpenChange: (open: boolean) => void; onDone: (deal: Deal) => void }) => {
  const form = useDealComposer(response, onDone);
  return (
    <Screen
      open
      onOpenChange={onOpenChange}
      title="Запропонувати угоду"
      desktop="panel"
      footer={
        <div className="grid gap-2">
          {form.error && (
            <p role="alert" className="auth-error">
              {form.error}
            </p>
          )}
          <Button variant="offer" disabled={form.busy || !form.agree || Boolean(form.problem && !form.error && form.stages.length === 0)} onClick={() => void form.submit()} className="w-full">
            {form.busy && <Loader2 className="size-4 animate-spin" />}
            Запропонувати угоду
          </Button>
        </div>
      }
    >
      <DealComposer form={form} />
    </Screen>
  );
};
