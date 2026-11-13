"use client";

// components/auth/use-terms-consent.ts
//
// Галочка «Мені є 18 років, я приймаю умови та політику конфіденційності» у вході. Без неї код не надсилаємо
// і в Google не йдемо; сервер перевіряє те саме (`accepted`), клієнт лише підказує раніше.

import { useState } from "react";

export const TERMS_CHECKBOX_ID = "auth-terms";
const TERMS_ERROR = "Поставте галочку, щоб продовжити.";

export const useTermsConsent = () => {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (value: boolean) => {
    setAgreed(value);
    if (value) setError(null);
  };

  /** Пускає далі, якщо галочка стоїть; інакше показує помилку біля неї й ставить на неї фокус. */
  const confirm = (): boolean => {
    if (agreed) return true;
    setError(TERMS_ERROR);
    document.getElementById(TERMS_CHECKBOX_ID)?.focus();
    return false;
  };

  return { agreed, error, change, confirm };
};
