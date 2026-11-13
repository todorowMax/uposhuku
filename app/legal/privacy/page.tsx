import type { Metadata } from "next";
import { ConsentControls } from "@/components/legal/consent-controls";
import { LegalPage, LegalSections } from "@/components/legal/legal-page";
import { fill, UPDATED } from "@/lib/legal/config";
import { PRIVACY_INTRO, privacySections } from "@/lib/legal/privacy";
import { legalFlags } from "@/lib/server/safe-deal";

export const metadata: Metadata = {
  title: "Політика конфіденційності · Findlyfy",
  description: "Які дані збирає Findlyfy, що з них видно іншим і кому вони передаються.",
  alternates: { canonical: "/legal/privacy" },
};

// Розділи залежать від режимів безпечної угоди й крипти (змінні воркера), тож сторінка не статична.
export const dynamic = "force-dynamic";

const PrivacyPage = async () => {
  const flags = await legalFlags();
  return (
    <LegalPage title="Конфіденційність" updated={UPDATED.privacy}>
      <p>{fill(PRIVACY_INTRO)}</p>
      <LegalSections sections={privacySections(flags)} />
      <section id="statistics-choice" className="legal-section">
        <h2>Ваш вибір щодо статистики</h2>
        <ConsentControls />
      </section>
    </LegalPage>
  );
};

export default PrivacyPage;
