// app/sitemap.ts
//
// Карта сайту: головна, юридичні сторінки й опубліковані профілі виконавців. Оферту безпечної угоди не вносимо:
// її читає банк, у пошуку вона не потрібна. Адреса береться зі SITE_URL (прод або dev), профілі беремо лише за id.
// Рядок `Sitemap:` у robots.ts з'являється, лише коли індексацію відкрито (lib/seo/indexing.ts).

import type { MetadataRoute } from "next";
import { listPublishedProfileIds } from "@/lib/server/profile-repo";
import { siteUrl } from "@/lib/server/env";

// Профілі беремо з бази під час запиту.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/offer", "/legal/terms", "/legal/privacy", "/contacts"];

const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const site = siteUrl();
  const ids = await listPublishedProfileIds().catch(() => []);
  return [
    ...PAGES.map((path) => ({ url: `${site}${path === "/" ? "" : path}` })),
    // Демо-виконавці з сіда (demo-…) вигадані й закриті від пошуку на їхніх сторінках: listPublishedProfileIds їх не віддає.
    ...ids.map((userId) => ({ url: `${site}/p/${encodeURIComponent(`me-${userId}`)}` })),
  ];
};

export default sitemap;
