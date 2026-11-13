"use client";

// components/account/use-export-data.ts
//
// Логіка екрана «Завантажити мої дані»: одна кнопка, статус результату в живій області.

import { useState } from "react";
import { downloadMyData, exportScreenStore } from "@/lib/account/client";
import { useStore } from "@/lib/store";

export const useExportData = () => {
  const open = useStore(exportScreenStore);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const onOpenChange = (next: boolean) => {
    exportScreenStore.set(next);
    if (!next) setNote(null);
  };

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      await downloadMyData();
      setNote({ tone: "ok", text: "Файл збережено на ваш пристрій." });
    } catch (reason) {
      setNote({ tone: "error", text: reason instanceof Error ? reason.message : "Не вдалося завантажити. Спробуйте ще раз." });
    } finally {
      setBusy(false);
    }
  };

  return { open, onOpenChange, busy, note, download };
};
