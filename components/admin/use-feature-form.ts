"use client";

// components/admin/use-feature-form.ts
//
// Зміна прапорця функції в адмінці: режим, список пошт, код TOTP для грошових, запит до API.

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FeatureMode, FeatureName } from "@/lib/features/flags";

export const useFeatureForm = (input: { feature: FeatureName; mode: FeatureMode; users: string; needsCode: boolean }) => {
  const router = useRouter();
  const [mode, setMode] = useState<FeatureMode>(input.mode);
  const [users, setUsers] = useState(input.users);
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const codeOk = !input.needsCode || /^\d{6}$/.test(totp.replace(/\s/g, ""));
  const listOk = mode !== "allowlist" || users.trim().length > 0;
  const changed = mode !== input.mode || users.trim() !== input.users.trim();
  const ready = changed && codeOk && listOk && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/features", { method: "PUT", body: JSON.stringify({ feature: input.feature, mode, users, totp }) });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? "Не вдалося зберегти.");
        return;
      }
      setTotp("");
      setSaved(true);
      router.refresh();
    } catch {
      setError("Немає зв'язку з сервером.");
    } finally {
      setBusy(false);
    }
  };

  return { mode, setMode, users, setUsers, totp, setTotp, busy, error, saved, ready, submit };
};
