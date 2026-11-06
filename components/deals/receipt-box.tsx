"use client";

// components/deals/receipt-box.tsx
//
// Чек до етапу прямого переказу: необов'язково, лише картинка (скриншот чи фото). Файл лежить у розмові угоди,
// тож бачать його сторони й модератор. Угода без розмови: блок прихований.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
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

export const ReceiptBox = ({ deal, stage }: { deal: Pick<Deal, "id" | "requestId" | "conversationId">; stage: Pick<DealStage, "id" | "receiptAttachmentId"> }) => {
  const { fileRef, busy, error, pick, choose } = useReceipt(deal, stage.id);
  if (!deal.conversationId) return null;
  return (
    <div className="grid gap-1.5">
      <p className="pe-hint">Необов&apos;язково, але в разі спору це допоможе.</p>
      {stage.receiptAttachmentId && (
        <p className="pe-hint" role="status">
          Чек додано:{" "}
          <a href={receiptUrl(deal.conversationId, stage.receiptAttachmentId)} target="_blank" rel="noopener noreferrer" className="underline">
            відкрити
          </a>
        </p>
      )}
      {/* Прихований вибір файлу за кнопкою: дозволено правилом DS-2. */}
      {/* eslint-disable-next-line no-restricted-syntax -- DS-2: type="file" за Button */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void pick(event.target.files)} />
      <Button variant="secondary" disabled={busy} onClick={choose} className="w-auto px-4">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {stage.receiptAttachmentId ? "Замінити чек" : "Додати чек"}
      </Button>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
};
