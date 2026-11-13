import type { Metadata } from "next";
import { LegalPage, LegalSections } from "@/components/legal/legal-page";
import { fill, UPDATED } from "@/lib/legal/config";
import { legalFlags } from "@/lib/server/safe-deal";
import { TERMS_INTRO, termsSections } from "@/lib/legal/terms";

export const metadata: Metadata = {
  title: "Умови користування · Findlyfy",
  description: "Правила сервісу: хто що робить, чат і оплата роботи, відгуки, заборонене, скарги.",
  alternates: { canonical: "/legal/terms" },
};

// Режими безпечної угоди й крипти читаються зі змінних воркера під час запиту, тож сторінка не статична.
export const dynamic = "force-dynamic";

const TermsPage = async () => {
  const flags = await legalFlags();
  return (
    <LegalPage title="Умови користування" updated={UPDATED.terms}>
      <p>{fill(TERMS_INTRO)}</p>
      <LegalSections sections={termsSections(flags)} />
    </LegalPage>
  );
};

export default TermsPage;
