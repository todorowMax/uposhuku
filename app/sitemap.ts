// app/sitemap.ts
//
// Карта сайту: головна, юридичні сторінки, опубліковані профілі виконавців і сторінки каталогу, які проходять поріг
// індексації (3 і більше виконавців, lib/seo/catalog.ts). Оферту безпечної угоди не вносимо: її читає банк, у пошуку вона не
// потрібна. Адреса береться зі SITE_URL (прод або dev), профілі й каталог лише за id та слагами.
// Рядок `Sitemap:` у robots.ts з'являється, лише коли індексацію відкрито (lib/seo/indexing.ts).

import type { MetadataRoute } from "next";
import { listIndexableCatalogPaths } from "@/lib/server/catalog-repo";
import { listPublishedProfileIds } from "@/lib/server/profile-repo";
import { siteUrl } from "@/lib/server/env";
import { catalogPath } from "@/lib/seo/catalog";

// Профілі беремо з бази під час запиту.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/offer", "/legal/terms", "/legal/privacy", "/contacts"];

const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const site = siteUrl();
  const [ids, catalog] = await Promise.all([
    listPublishedProfileIds().catch(() => []),
    listIndexableCatalogPaths().catch(() => []),
  ]);
  return [
    ...PAGES.map((path) => ({ url: `${site}${path === "/" ? "" : path}` })),
    // Демо-виконавці з сіда (demo-…) вигадані й закриті від пошуку на їхніх сторінках: listPublishedProfileIds їх не віддає.
    ...ids.map((userId) => ({ url: `${site}/p/${encodeURIComponent(`me-${userId}`)}` })),
    ...catalog.map(({ tagId, cityId }) => ({ url: `${site}${catalogPath(tagId, cityId)}` })),
  ];
};

export default sitemap;
