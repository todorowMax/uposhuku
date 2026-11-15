import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPageView } from "@/components/catalog-page/catalog-page-view";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/server/env";
import { getCatalog } from "@/lib/server/catalog-repo";
import { siteRobots } from "@/lib/server/seo";
import { catalogHeading, catalogPath, resolveCatalogParams } from "@/lib/seo/catalog";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo/json-ld";
import { tagHeading } from "@/lib/tags/catalog";

export namespace CatalogRouteTypes {
  export type Params = { tag: string; city?: string };
  export type Props = { params: Promise<Params> };
}

/** Адреса із дивним відсотком не дає 500: такий слаг просто не знайдеться. */
const decoded = (value: string | undefined) => {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolve = async (params: CatalogRouteTypes.Props["params"]) => {
  const { tag, city } = await params;
  return resolveCatalogParams(decoded(tag) ?? "", decoded(city));
};

/** `generateMetadata` для обох сторінок каталогу. Не індексована сторінка (мало виконавців): `noindex, follow`. */
export const catalogMetadata = async ({ params }: CatalogRouteTypes.Props): Promise<Metadata> => {
  const target = await resolve(params);
  if (!target) return { title: "Сторінку не знайдено", robots: { index: false, follow: false } };
  const data = await getCatalog(target.tagId, target.cityId);
  const heading = catalogHeading(target.tagId, target.cityId);
  const title = `${heading} · Findlyfy`;
  const description = `${heading}: виконавці на карті Findlyfy, відкриті запити замовників і орієнтовний бюджет.`;
  const url = `${siteUrl()}${catalogPath(target.tagId, target.cityId)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Свій openGraph замінює кореневий цілком, тож картинку для превью повторюємо.
    openGraph: { title, description, type: "website", locale: "uk_UA", siteName: "Findlyfy", url, images: ["/og.png"] },
    // Поки сайт закритий, діє загальна заборона з кореневого layout (`siteRobots`); коли відкритий, тонка сторінка йде з noindex, follow.
    ...(data.indexable ? {} : { robots: siteRobots() ?? { index: false, follow: true } }),
  };
};

/** Тіло сторінки каталогу: дані, 404 для невідомого, розмітка й JSON-LD. */
export const CatalogRoute = async ({ params }: CatalogRouteTypes.Props) => {
  const target = await resolve(params);
  if (!target) notFound();
  const data = await getCatalog(target.tagId, target.cityId);
  const site = siteUrl();
  const crumbs = [
    { name: "Findlyfy", url: site },
    { name: tagHeading(target.tagId) ?? target.tagId, url: `${site}${catalogPath(target.tagId)}` },
    ...(target.cityId ? [{ name: catalogHeading(target.tagId, target.cityId), url: `${site}${catalogPath(target.tagId, target.cityId)}` }] : []),
  ];
  const items = data.performers.map((performer) => ({ name: performer.name, url: `${site}/p/${encodeURIComponent(performer.id)}` }));
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {items.length > 0 && <JsonLd data={itemListJsonLd(items)} />}
      <CatalogPageView data={data} />
    </>
  );
};
