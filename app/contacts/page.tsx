import type { Metadata } from "next";
import { LegalDetails, LegalPage } from "@/components/legal/legal-page";
import { CONTACT_EMAIL, OPERATOR, UPDATED } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Контакти · Vibe Map",
  description: "Як зв'язатися з Vibe Map і хто юридично надає сервіс.",
  alternates: { canonical: "/contacts" },
};

export default function ContactsPage() {
  return (
    <LegalPage title="Контакти" updated={UPDATED.contacts}>
      <p>
        Найшвидший спосіб достукатися до нас — пошта нижче. Пишіть про помилку, ідею, скаргу на профіль чи запит або пропозицію співпраці: відповідає сама команда, без call-центру.
        Скарги й запити на видалення акаунта розглядаємо протягом 14 календарних днів. Відповідаємо українською.
      </p>
      <section className="legal-section">
        <h2>Пошта</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
      <section className="legal-section">
        <h2>Хто надає сервіс</h2>
      </section>
      <LegalDetails
        rows={[
          ["Оператор", OPERATOR.entity],
          ["РНОКПП", OPERATOR.taxId],
          ["Адреса", OPERATOR.address],
        ]}
      />
    </LegalPage>
  );
}
