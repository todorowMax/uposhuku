"use client";

// components/deals/use-receipt.ts
//
// Чек до етапу: стискаємо картинку, вантажимо в розмову угоди (та сама завантажувалка, що й фото в чаті),
// потім прив'язуємо до етапу. Помилки показуємо поруч, угоду оновлюємо через loadDeals.

import { useRef, useState } from "react";
import { callApi, loadDeals } from "@/lib/deals/client";
import { uploadChatPhoto } from "@/lib/chat/client";
import { compressForChat } from "@/lib/images/resize";
import type { Deal } from "@/lib/deals/types";

export const useReceipt = (deal: Pick<Deal, "id" | "requestId" | "conversationId">, stageId: string) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (files: FileList | null): Promise<boolean> => {
    const file = files?.[0];
    if (!file || !deal.conversationId) return false;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadChatPhoto(deal.conversationId, await compressForChat(file));
      await callApi(`/api/deals/${encodeURIComponent(deal.id)}/receipt`, { method: "POST", body: JSON.stringify({ stageId, attachmentId: uploaded.id }) });
      await loadDeals(deal.requestId);
      return true;
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "Не вдалося додати чек.");
      return false;
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const choose = () => fileRef.current?.click();

  return { fileRef, busy, error, pick, choose };
};
