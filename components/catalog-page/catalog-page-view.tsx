import Image from "next/image";
import Link from "next/link";
import { initialsOf } from "@/components/profile-page/utils";
import { SiteShell, pageLinkClass } from "@/components/site-page/site-shell";
import { cityById } from "@/lib/map/cities";
import type { CatalogData } from "@/lib/server/catalog-repo";
import { catalogHeading, catalogPath, nearestCities } from "@/lib/seo/catalog";
import { tagHeading } from "@/lib/tags/catalog";

export namespace CatalogPageViewTypes {
  export type Props = { data: CatalogData };
}

const PRICE = new Intl.NumberFormat("uk-UA");
const NEIGHBOURS = 6;

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid content-start gap-1">
    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
    <dd className="text-base text-ink">{children}</dd>
  </div>
);

/**
 * Каталог «послуга» або «послуга + місто»: виконавці з карти з посиланнями на профілі, число відкритих публічних запитів,
 * медіанний бюджет, сусідні міста й споріднені послуги. Рендериться на сервері без карти й MapLibre.
 */
export const CatalogPageView = ({ data }: CatalogPageViewTypes.Props) => {
  const heading = catalogHeading(data.tagId, data.cityId);
  const cityIds = data.cities.map((item) => item.cityId);
  const otherCities = data.cityId ? nearestCities(data.cityId, cityIds, NEIGHBOURS) : cityIds.slice(0, NEIGHBOURS * 2);
  return (
    <SiteShell skipLabel="Перейти до каталогу">
      <nav aria-label="Навігація сторінкою">
        <ol className="flex flex-wrap gap-x-2 text-sm text-ink-muted">
          <li>
            <Link href="/" className={pageLinkClass}>
              Findlyfy
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {data.cityId ? (
              <Link href={catalogPath(data.tagId)} className={pageLinkClass}>
                {tagHeading(data.tagId)}
              </Link>
            ) : (
              <span aria-current="page">{tagHeading(data.tagId)}</span>
            )}
          </li>
          {data.cityId && (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <span aria-current="page">{cityById(data.cityId).name}</span>
              </li>
            </>
          )}
        </ol>
      </nav>

      <header className="grid gap-3">
        <h1 className="text-2xl font-semibold leading-tight text-ink break-words">{heading}</h1>
        <p className="text-base text-ink-muted">Виконавці, які зараз на карті Findlyfy, і запити замовників за цією послугою.</p>
      </header>

      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-line p-5 sm:grid-cols-3">
        <Fact label="Виконавців">{PRICE.format(data.performerCount)}</Fact>
        <Fact label="Відкритих запитів">{PRICE.format(data.openRequests)}</Fact>
        <Fact label="Медіанний бюджет">{data.medianBudget === null ? "Ще немає даних" : `${PRICE.format(data.medianBudget)} ₴`}</Fact>
      </dl>

      <section aria-labelledby="cat-performers" className="grid gap-3">
        <h2 id="cat-performers" className="text-xl font-semibold text-ink">
          Виконавці
        </h2>
        {data.performers.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-muted">
            Виконавців за цією послугою на карті поки немає.{" "}
            <Link href="/" className={pageLinkClass}>
              Опишіть задачу на карті
            </Link>
            , і її побачать виконавці з підходящими навичками.
          </p>
        ) : (
          <ul className="grid gap-3">
            {data.performers.map((performer) => (
              <li key={performer.id}>
                <Link
                  href={`/p/${encodeURIComponent(performer.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-line p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {performer.photoUrl ? (
                    <Image src={performer.photoUrl} alt="" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-hover-blue text-base font-semibold text-ink">
                      {initialsOf(performer.name)}
                    </span>
                  )}
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-base font-semibold text-ink break-words">{performer.name}</span>
                    <span className="text-sm text-ink break-words">{performer.specialty}</span>
                    <span className="text-xs text-ink-muted">
                      {performer.city}
                      {performer.rating !== null && ` · оцінка ${performer.rating.toFixed(1)} з 5`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {otherCities.length > 0 && (
        <section aria-labelledby="cat-cities" className="grid gap-3">
          <h2 id="cat-cities" className="text-xl font-semibold text-ink">
            {data.cityId ? "Сусідні міста" : "Міста"}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {otherCities.map((cityId) => (
              <li key={cityId}>
                <Link href={catalogPath(data.tagId, cityId)} className={`inline-block rounded-xl bg-hover-blue px-3 py-1 text-sm ${pageLinkClass}`}>
                  {catalogHeading(data.tagId, cityId)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.relatedTags.length > 0 && (
        <section aria-labelledby="cat-related" className="grid gap-3">
          <h2 id="cat-related" className="text-xl font-semibold text-ink">
            Схожі послуги
          </h2>
          <ul className="flex flex-wrap gap-2">
            {data.relatedTags.map((item) => (
              <li key={item.tagId}>
                <Link href={catalogPath(item.tagId, data.cityId)} className={`inline-block rounded-xl bg-hover-blue px-3 py-1 text-sm ${pageLinkClass}`}>
                  {catalogHeading(item.tagId, data.cityId)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SiteShell>
  );
};
