import { legalLinks } from "@/lib/legal/links";

/** Короткий рядок посилань на документи: легенда карти, де їх бачить і гість. */
export function DocLinks() {
  return (
    <nav aria-label="Документи" className="doc-links">
      {legalLinks(false).map((link) => (
        <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
