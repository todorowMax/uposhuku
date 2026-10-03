import type { Metadata } from "next";
import { LegalPage, LegalSections } from "@/components/legal/legal-page";
import { fill, UPDATED } from "@/lib/legal/config";
import { PRIVACY_INTRO, privacySections } from "@/lib/legal/privacy";

export const metadata: Metadata = {
  title: "Політика конфіденційності · Vibe Map",
  description: "Які дані збирає Vibe Map, що з них видно іншим і кому вони передаються.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Конфіденційність" updated={UPDATED.privacy}>
      <p>{fill(PRIVACY_INTRO)}</p>
      <LegalSections sections={privacySections()} />
    </LegalPage>
  );
}
