import type { Metadata } from "next";
import { LegalDetails, LegalPage, LegalSections } from "@/components/legal/legal-page";
import { CONTACT_EMAIL, CONTACT_PHONE, OPERATOR, UPDATED } from "@/lib/legal/config";
import { safeDealOfferSections } from "@/lib/legal/safe-deal-offer";
import { numbered } from "@/lib/legal/types";

export const metadata: Metadata = {
  title: "Оферта для виконавців: безпечна угода · Findlyfy",
  description: "Публічний договір про послуги технічного характеру для виконавців-ФОП: безпечна угода, розщеплення платежу, тариф, спори.",
  alternates: { canonical: "/offer/safe-deal" },
};

/**
 * Публічний договір для виконавців-ФОП про послуги технічного характеру. Його
 * просить Monobank для розщеплення платежу. Тексти — lib/legal/safe-deal-offer.ts.
 */
export default function SafeDealOfferPage() {
  const sections = numbered(safeDealOfferSections());
  return (
    <LegalPage title="Оферта для виконавців" updated={UPDATED.safeDealOffer}>
      <p className="font-semibold text-ink">Публічний договір про надання послуг технічного характеру (безпечна угода)</p>
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
          ["Телефон", CONTACT_PHONE],
        ]}
      />
    </LegalPage>
  );
}
