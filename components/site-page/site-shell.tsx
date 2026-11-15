import Link from "next/link";

export namespace SiteShellTypes {
  export type Props = { skipLabel: string; children: React.ReactNode };
}

const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Умови" },
  { href: "/legal/privacy", label: "Політика конфіденційності" },
  { href: "/contacts", label: "Контакти" },
] as const;

export const pageLinkClass =
  "font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Оболонка серверних сторінок поза картою (профіль, каталог): пропуск до змісту, шапка, один `main`, підвал із документами.
 * Фон світлий: `--bg` у застосунку темний (небо над картою), тут сторінка читається як документ.
 */
export const SiteShell = ({ skipLabel, children }: SiteShellTypes.Props) => (
  <>
    <a href="#main" className="skip-link">
      {skipLabel}
    </a>
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-wide text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Findlyfy
          </Link>
          <Link href="/" className={`text-sm ${pageLinkClass}`}>
            На карту
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="grid flex-1 content-start gap-6">
          {children}
        </main>
        <footer>
          <nav aria-label="Документи" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={pageLinkClass}>
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </div>
  </>
);
