"use client";

// components/legal/legal-sheets.tsx
//
// Шторки для розкладки карти: оновлені умови, ризики крипти й підтвердження телефона. Монтуються один раз.

import { PhoneVerifySheet } from "@/components/phone/phone-verify-sheet";
import { RiskSheet } from "@/components/legal/risk-sheet";
import { TermsUpdateSheet } from "@/components/legal/terms-update-sheet";

export const LegalSheets = () => (
  <>
    <TermsUpdateSheet />
    <RiskSheet />
    <PhoneVerifySheet />
  </>
);
