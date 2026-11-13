"use client";

// components/legal/use-risk-sheet.ts
//
// Логіка вікна ризиків крипти (components/legal/risk-sheet.tsx): галочка «Я зрозумів(ла) ризики», запис згоди `cryptoRisk` і відповідь тому, хто
// чекає (дія продовжується лише після прийняття). Закриття без прийняття відповідає «ні».

import { useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { acceptDocs, riskSheetStore } from "@/lib/legal/client";
import { LEGAL_VERSIONS } from "@/lib/legal/config";
import { useStore } from "@/lib/store";

export const useRiskSheet = () => {
  const request = useStore(riskSheetStore);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setChecked(false);
    setError(null);
  };

  const dismiss = () => {
    request?.settle(false);
    reset();
  };

  const accept = async () => {
    if (!checked || busy || !request) return;
    setBusy(true);
    setError(null);
    try {
      await acceptDocs([{ doc: "cryptoRisk", version: LEGAL_VERSIONS.cryptoRisk }]);
      request.settle(true);
      reset();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося записати згоду. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return { open: request !== null, checked, setChecked, busy, error, accept, dismiss };
};
