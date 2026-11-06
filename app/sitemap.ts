// app/sitemap.ts
//
// Карта сайту: головна, юридичні сторінки й опубліковані профілі виконавців. Оферту безпечної угоди не вносимо:
// її читає банк, у пошуку вона не потрібна. Рядок `Sitemap:` у robots.ts додасть той, хто відкриє індексацію (пакет C).

import type { MetadataRoute } from "next";
import { listPublishedProfiles } from "@/lib/server/profile-repo";

const SITE = "https://findlyfy.com";

// Профілі беремо з бази під час запиту.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/offer", "/legal/terms", "/legal/privacy", "/contacts"];

const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const profiles = await listPublishedProfiles().catch(() => new Map());
  return [
    ...PAGES.map((path) => ({ url: `${SITE}${path === "/" ? "" : path}` })),
    // Демо-виконавці з сіда вигадані й закриті від пошуку на їхніх сторінках: у карту їх не вносимо.
    ...[...profiles.keys()].filter((userId) => !userId.startsWith("demo-")).map((userId) => ({ url: `${SITE}/p/${encodeURIComponent(`me-${userId}`)}` })),
  ];
};

export default sitemap;
