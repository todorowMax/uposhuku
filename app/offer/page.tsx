import type { Metadata } from "next";
import { LegalDetails, LegalPage, LegalSections } from "@/components/legal/legal-page";
import { CONTACT_EMAIL, OPERATOR, UPDATED } from "@/lib/legal/config";
import { offerSections } from "@/lib/legal/offer";
import { numbered } from "@/lib/legal/types";

export const metadata: Metadata = {
  title: "Публічна оферта · Vibe Map",
  description: "Договір про розміщення профілю на карті: сторони, оплата, повернення коштів, відповідальність.",
  alternates: { canonical: "/offer" },
};

/**
 * Договір публічної оферти: його просить банк перед еквайрингом, на нього
 * веде галочка згоди перед оплатою розміщення. Тексти — lib/legal/offer.ts.
 */
export default function OfferPage() {
  const sections = numbered(offerSections());
  return (
    <LegalPage title="Публічна оферта" updated={UPDATED.offer}>
      <p className="font-semibold text-ink">Договір про надання послуги розміщення профілю на карті</p>
      <LegalSections sections={sections} />
      <section className="legal-section">
        <h2>{sections.length + 1}. Реквізити Оператора</h2>
      </section>
      <LegalDetails
        rows={[
          ["Оператор", OPERATOR.entity],
          ["РНОКПП", OPERATOR.taxId],
          ["Адреса", OPERATOR.address],
          ["Пошта", CONTACT_EMAIL],
        ]}
      />
    </LegalPage>
  );
}
