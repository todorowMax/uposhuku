// app/robots.ts
import type { MetadataRoute } from "next";

// Поки сайт закритий від індексації. Для відкриття: прибрати Disallow, noindex у layout і X-Robots-Tag у worker.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
