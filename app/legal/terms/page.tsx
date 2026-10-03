import type { Metadata } from "next";
import { LegalPage, LegalSections } from "@/components/legal/legal-page";
import { fill, UPDATED } from "@/lib/legal/config";
import { TERMS_INTRO, termsSections } from "@/lib/legal/terms";

export const metadata: Metadata = {
  title: "Умови користування · Vibe Map",
  description: "Правила сервісу: хто що робить, чат і оплата роботи, відгуки, заборонене, скарги.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Умови користування" updated={UPDATED.terms}>
      <p>{fill(TERMS_INTRO)}</p>
      <LegalSections sections={termsSections()} />
    </LegalPage>
  );
}
