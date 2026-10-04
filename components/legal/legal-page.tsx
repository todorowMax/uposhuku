import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { fill, SERVICE_NAME } from "@/lib/legal/config";
import { LEGAL_LINKS } from "@/lib/legal/links";
import type { LegalSectionData } from "@/lib/legal/types";

/**
 * Оболонка правових сторінок.
 *
 * Сторінки відкриті без входу навмисно: Google і банк просять посилання на
 * них, а людина має прочитати умови до того, як заводити акаунт чи платити.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <div className="legal-sheet">
        <Link href="/" className="legal-back">
          <ArrowLeft className="size-4" /> На карту
        </Link>
        <header className="grid gap-1">
          <p className="legal-brand">{SERVICE_NAME}</p>
          <h1 className="legal-title">{title}</h1>
          <p className="text-[13px] text-ink-muted">Оновлено {updated}</p>
        </header>
        <div className="legal-body">{children}</div>
        <LegalNav />
      </div>
    </main>
  );
}

/** Перехід між документами внизу кожної сторінки. */
export function LegalNav() {
  return (
    <nav aria-label="Документи" className="legal-nav">
      {LEGAL_LINKS.map((link) => (
        <Link key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Дрібна розмітка в текстах: **жирний** і [посилання](/шлях). Більше нічого, щоб не тягнути markdown. */
function Inline({ text }: { text: string }) {
  const parts = fill(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        if (bold) return <strong key={index} className="font-semibold text-ink">{bold[1]}</strong>;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <Link key={index} href={link[2]} className="legal-link">
              {link[1]}
            </Link>
          );
        }
        return part;
      })}
    </>
  );
}

export function LegalSections({ sections }: { sections: LegalSectionData[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.title} id={section.id} className="legal-section">
          <h2>{fill(section.title)}</h2>
          {section.items.map((item) => (
            <p key={item}>
              <Inline text={item} />
            </p>
          ))}
        </section>
      ))}
    </>
  );
}

export function LegalDetails({ rows }: { rows: [string, string][] }) {
  return (
    <section id="details" className="legal-section">
      <dl className="legal-details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
