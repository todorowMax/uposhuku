"use client";

// components/admin/use-complaint-close.ts
//
// Закриття скарги: коментар модератора, запит до API, стан кнопки й помилка.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkComment } from "@/lib/admin/decisions";

export const useComplaintClose = (complaintId: string) => {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const checked = checkComment(comment);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/complaints/${encodeURIComponent(complaintId)}/close`, { method: "POST", body: JSON.stringify({ comment: checked.comment }) });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? "Не вдалося закрити скаргу.");
        return;
      }
      router.refresh();
    } catch {
      setError("Немає зв'язку з сервером.");
    } finally {
      setBusy(false);
    }
  };

  return { comment, setComment, busy, error, submit };
};
