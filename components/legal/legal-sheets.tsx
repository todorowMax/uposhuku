"use client";

// components/legal/legal-sheets.tsx
//
// Обидві правові шторки для розкладки карти: оновлені умови й ризики крипти. Монтуються один раз.

import { RiskSheet } from "@/components/legal/risk-sheet";
import { TermsUpdateSheet } from "@/components/legal/terms-update-sheet";

export const LegalSheets = () => (
  <>
    <TermsUpdateSheet />
    <RiskSheet />
  </>
);
