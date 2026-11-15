import Link from "next/link";
import { RespondAction } from "@/components/request-page/respond-action";
import { CITIES } from "@/lib/map/cities";
import { requestTitle, type PublicRequest } from "@/lib/requests/public";
import { DEADLINES } from "@/lib/requests/types";
import { tagLabel } from "@/lib/tags/engine";

export namespace RequestViewTypes {
  export type Props = { request: PublicRequest };
}

const PRICE = new Intl.NumberFormat("uk-UA");
const DATE = new Intl.DateTimeFormat("uk-UA", {
  dateStyle: "long",
  timeZone: "Europe/Kyiv",
});
const FOOTER_LINKS = [
  { href: "/legal/terms", label: "Умови" },
  { href: "/legal/privacy", label: "Політика конфіденційності" },
  { href: "/contacts", label: "Контакти" },
] as const;

const linkClass =
  "font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const Fact = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="grid content-start gap-1">
    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {label}
    </dt>
    <dd className="text-base text-ink">{children}</dd>
  </div>
);

/** Назва тегу зі словника; тег, якого там уже немає, показуємо за збереженою назвою. */
const labelOf = (tag: { id: string; label: string }) => {
  const known = tagLabel(tag.id);
  return known === tag.id ? tag.label : known;
};

/**
 * Публічна сторінка запиту: текст без контактів, умови й одна дія «Відгукнутися». Імені, пошти, телефона й файлів автора тут
 * немає навіть у даних (див. getPublicRequest). Рендериться на сервері, карту й MapLibre не вантажить.
 */
export const RequestView = ({ request }: RequestViewTypes.Props) => {
  const title = requestTitle(request.text);
  const city =
    CITIES.find((item) => item.id === request.cityId)?.name ?? "Віддалено";
  const closed = request.status === "closed";
  return (
    <>
      <a href="#main" className="skip-link">
        Перейти до запиту
      </a>
      {/* Фон сторінки світлий: --bg у застосунку темний (небо над картою), а тут його читають як звичайний документ. */}
      <div className="min-h-dvh bg-surface">
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
          <header className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm font-semibold uppercase tracking-wide text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Findlyfy
            </Link>
            <Link href="/" className={`text-sm ${linkClass}`}>
              На карту
            </Link>
          </header>

          <main
            id="main"
            tabIndex={-1}
            className="grid flex-1 content-start gap-6"
          >
            <article className="grid gap-5 rounded-xl border border-line p-5 sm:p-6">
              <header className="grid gap-3">
                <p className="text-sm font-semibold text-ink-muted">
                  {closed ? "Виконавця знайдено" : "Запит на Findlyfy"}
                </p>
                <h1 className="text-2xl font-semibold leading-tight text-ink break-words">
                  {title}
                </h1>
              </header>

              {request.text.trim() !== title && (
                <p className="whitespace-pre-line text-base leading-relaxed text-ink break-words">
                  {request.text}
                </p>
              )}

              {request.tags.length > 0 && (
                <ul aria-label="Теги запиту" className="flex flex-wrap gap-2">
                  {request.tags.map((tag) => (
                    <li
                      key={tag.id}
                      className="rounded-xl bg-hover-blue px-3 py-1 text-sm text-ink"
                    >
                      {labelOf(tag)}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Місто">{city}</Fact>
                <Fact label="Бюджет">
                  {request.budget
                    ? `до ${PRICE.format(request.budget)} ₴`
                    : "За домовленістю"}
                </Fact>
                <Fact label="Термін">
                  {request.deadline
                    ? DEADLINES[request.deadline]
                    : "Не вказано"}
                </Fact>
                <Fact label="Опубліковано">
                  <time dateTime={request.createdAt}>
                    {DATE.format(new Date(request.createdAt))}
                  </time>
                </Fact>
                <Fact label="Відгуків">
                  {PRICE.format(request.responseCount)}
                </Fact>
              </dl>

              {request.own && !request.shared && (
                <p className="rounded-xl bg-hover-blue p-3 text-sm text-ink">
                  Цей запит не показано всім: сторінку бачите лише ви.
                </p>
              )}
            </article>

            <section aria-label="Дія" className="grid gap-3">
              {closed ? (
                <>
                  <p className="text-base text-ink">
                    Автор уже знайшов виконавця. Відкриті запити й виконавці на
                    карті.
                  </p>
                  <Link
                    href="/"
                    className="auth-primary w-full px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
                  >
                    На головну
                  </Link>
                </>
              ) : request.own ? (
                <Link
                  href={`/?open=offers%3A${encodeURIComponent(request.id)}`}
                  prefetch={false}
                  className="auth-primary w-full px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
                >
                  Переглянути пропозиції
                </Link>
              ) : (
                <RespondAction requestId={request.id} />
              )}
            </section>
          </main>

          <footer>
            <nav
              aria-label="Документи"
              className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm"
            >
              {FOOTER_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </footer>
        </div>
      </div>
    </>
  );
};
