// app/(map)/p/[id]/page.tsx
//
// Публічна сторінка виконавця. Прямий захід показує її одразу з текстом у
// HTML (для пошуку й посилань); з карти вона відкривається поверх неї без
// перезавантаження, бо карта живе в layout групи (map).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/profile-view";
import { cityById } from "@/lib/map/cities";
import { getPublicPerformer } from "@/lib/performers/server";
import { tagLabel } from "@/lib/tags/engine";

type Props = { params: Promise<{ id: string }> };

const SITE = "https://uposhuku.com";

const load = async (params: Props["params"]) => {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  return { id: decoded, performer: getPublicPerformer(decoded) };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, performer } = await load(params);
  if (!performer) return { title: "Профіль не знайдено", robots: { index: false } };
  const city = cityById(performer.cityId).name;
  const title = `${performer.name}: ${performer.specialty}, ${city}`;
  const description = performer.bio.trim().slice(0, 160) || `${performer.specialty} у місті ${city}. Роботи, відгуки й можливість описати задачу.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/p/${encodeURIComponent(id)}` },
    openGraph: { title, description, type: "profile", locale: "uk_UA" },
    // Демо-виконавці вигадані: в індекс їх не пускаємо.
    robots: id.startsWith("me-") ? undefined : { index: false, follow: true },
  };
}

export default async function PerformerPage({ params }: Props) {
  const { id, performer } = await load(params);
  if (!performer) notFound();
  const labels = Object.fromEntries(performer.tags.map((tag) => [tag, tagLabel(tag)]));
  const city = cityById(performer.cityId).name;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: performer.name,
    jobTitle: performer.specialty,
    description: performer.bio || undefined,
    url: `${SITE}/p/${encodeURIComponent(id)}`,
    homeLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: city, addressCountry: "UA" } },
  };
  return (
    <>
      {id.startsWith("me-") && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <ProfileView id={id} initial={performer} initialLabels={labels} />
    </>
  );
}
