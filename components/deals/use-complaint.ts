"use client";

// components/deals/use-complaint.ts
//
// Скарга на пряму угоду: відкрити форму, причина, текст, запит. Гроші й статус етапу не змінюються,
// тому після успіху лише показуємо, що скаргу подано.

import { useState } from "react";
import { callApi } from "@/lib/deals/client";
import { checkComplaint, type ComplaintReason } from "@/lib/deals/complaints";

export const useComplaint = (dealId: string, stageId: string) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const checked = checkComplaint(reason, text);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: { stageId: string; reason: ComplaintReason; text: string } = { stageId, ...checked.value };
      await callApi(`/api/deals/${encodeURIComponent(dealId)}/complaint`, { method: "POST", body: JSON.stringify(body) });
      setSent(true);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "Не вдалося подати скаргу.");
    } finally {
      setBusy(false);
    }
  };

  return { open, setOpen, reason, setReason, text, setText, busy, error, sent, submit };
};
