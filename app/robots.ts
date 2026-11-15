// app/robots.ts
import type { MetadataRoute } from "next";
import { indexingEnabled } from "@/lib/server/seo";
import { siteUrl } from "@/lib/server/env";

// Перемикач один: lib/seo/indexing.ts (прод і SEO_INDEXING=on). Закрито: Disallow без рядка Sitemap.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!indexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl()}/sitemap.xml` };
}
