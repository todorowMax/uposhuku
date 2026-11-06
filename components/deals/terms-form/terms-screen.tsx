"use client";

// components/deals/terms-form/terms-screen.tsx
//
// «Оформити умови» на екрані: поля одним стовпцем, унизу закріплена кнопка надсилання й помилка сервера.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import type { ConversationDto } from "@/lib/chat/types";
import { TermsForm } from "./terms-form";
import { useTermsForm } from "./use-terms-form";

export const TermsScreen = ({ conversation, onOpenChange, onDone }: { conversation: Pick<ConversationDto, "id" | "performerId">; onOpenChange: (open: boolean) => void; onDone: () => void }) => {
  const form = useTermsForm(conversation, onDone);
  return (
    <Screen
      open
      onOpenChange={onOpenChange}
      title="Оформити умови"
      desktop="panel"
      footer={
        <div className="grid gap-2">
          {form.error && (
            <p role="alert" className="auth-error">
              {form.error}
            </p>
          )}
          <Button variant="offer" disabled={form.busy} onClick={() => void form.submit()} className="w-full">
            {form.busy && <Loader2 className="size-4 animate-spin" />}
            Надіслати умови
          </Button>
        </div>
      }
    >
      <TermsForm form={form} />
    </Screen>
  );
};
