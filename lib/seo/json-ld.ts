// lib/seo/json-ld.ts
//
// Структуровані дані schema.org для серверних сторінок: профіль, каталог, головна. Чисті функції, що повертають
// об'єкти; у HTML їх кладе компонент JsonLd (components/seo/json-ld.tsx) через `serializeJsonLd`.

import type { PublicProfile } from "@/lib/profile/public";

export type JsonLd = Record<string, unknown>;

/** JSON для `<script type="application/ld+json">`: `<` екранується, щоб текст профілю не закрив тег. */
export const serializeJsonLd = (data: JsonLd): string => JSON.stringify(data).replace(/</g, "\\u003c");

const CONTEXT = "https://schema.org";

/** `ProfilePage` з `Person`: прежні поля плюс `knowsAbout` із тегів; `aggregateRating` лише з перевірених відгуків і лише коли вони є. */
export const profileJsonLd = (profile: PublicProfile, url: string): JsonLd => ({
  "@context": CONTEXT,
  "@type": "ProfilePage",
  url,
  mainEntity: {
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.specialty,
    description: profile.bio || undefined,
    url,
    homeLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: profile.city, addressCountry: "UA" },
    },
    knowsAbout: profile.tags.length > 0 ? profile.tags.map((tag) => tag.label) : undefined,
    aggregateRating: profile.verifiedRating
      ? {
          "@type": "AggregateRating",
          ratingValue: profile.verifiedRating.value,
          ratingCount: profile.verifiedRating.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
  },
});

export const breadcrumbJsonLd = (items: { name: string; url: string }[]): JsonLd => ({
  "@context": CONTEXT,
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
});

export const itemListJsonLd = (items: { name: string; url: string }[]): JsonLd => ({
  "@context": CONTEXT,
  "@type": "ItemList",
  numberOfItems: items.length,
  itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.url })),
});

export const organizationJsonLd = (site: string): JsonLd => ({
  "@context": CONTEXT,
  "@type": "Organization",
  name: "Findlyfy",
  url: site,
  logo: `${site}/apple-icon.png`,
});

export const websiteJsonLd = (site: string): JsonLd => ({
  "@context": CONTEXT,
  "@type": "WebSite",
  name: "Findlyfy",
  url: site,
  inLanguage: "uk",
});
