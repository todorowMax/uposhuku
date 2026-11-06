"use client";

// components/deals/receipt-box.tsx
//
// Чек до етапу прямого переказу: необов'язково, лише картинка (скриншот чи фото). Файл лежить у розмові угоди,
// тож бачать його сторони й модератор. Угода без розмови: блок прихований.

import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Deal, DealStage } from "@/lib/deals/types";
import { useReceipt } from "./use-receipt";

export const receiptUrl = (conversationId: string, attachmentId: string) => `/api/conversations/${conversationId}/attachments/${attachmentId}`;

/** Посилання на чек, який додав замовник: для виконавця. */
export const ReceiptLink = ({ conversationId, stage }: { conversationId: string; stage: Pick<DealStage, "receiptAttachmentId"> }) =>
  stage.receiptAttachmentId ? (
    <p className="pe-hint">
      Замовник додав чек:{" "}
      <a href={receiptUrl(conversationId, stage.receiptAttachmentId)} target="_blank" rel="noopener noreferrer" className="underline">
        відкрити
      </a>
    </p>
  ) : null;

/** «Додати чек»: кнопка відкриває шторку з вибором фото (шторка, бо це один вибір). */
export const ReceiptBox = ({ deal, stage }: { deal: Pick<Deal, "id" | "requestId" | "conversationId">; stage: Pick<DealStage, "id" | "receiptAttachmentId"> }) => {
  const { fileRef, busy, error, pick, choose } = useReceipt(deal, stage.id);
  const [open, setOpen] = useState(false);
  if (!deal.conversationId) return null;
  const label = stage.receiptAttachmentId ? "Замінити чек" : "Додати чек";
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-auto px-4">
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="ui-sheet-title">{label}</SheetTitle>
          <SheetBody className="grid gap-2">
            <p className="pe-hint">Необов&apos;язково, але в разі спору це допоможе. Скриншот чи фото переказу.</p>
            {stage.receiptAttachmentId && (
              <p className="pe-hint" role="status">
                Чек додано:{" "}
                <a href={receiptUrl(deal.conversationId, stage.receiptAttachmentId)} target="_blank" rel="noopener noreferrer" className="underline">
                  відкрити
                </a>
              </p>
            )}
            <FileInput ref={fileRef} accept="image/jpeg,image/png,image/webp" onChange={(event) => void pick(event.target.files).then((ok) => ok && setOpen(false))} />
            <Button variant="offer" disabled={busy} onClick={choose} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Обрати фото
            </Button>
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
};
