// app/(site)/p/[id]/page.tsx
//
// Публічна сторінка виконавця для прямого заходу, пошуку й посилань: `h1`, спеціальність, місто, опис, теги, роботи й
// відгуки в серверному HTML, без карти й MapLibre (група (site) не має layout карти). З самої карти профіль відкривається
// вікном поверх неї через перехоплений маршрут app/(map)/@modal/(.)p/[id]. Невідомий або не опублікований профіль: 404.

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfilePageView } from "@/components/profile-page/profile-page-view";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/server/env";
import { getPublicProfile } from "@/lib/server/profile-repo";
import { profileJsonLd } from "@/lib/seo/json-ld";

type Props = { params: Promise<{ id: string }> };

// Читаємо базу під час запиту: профіль змінюється, а SITE_URL відомий лише воркеру.
export const dynamic = "force-dynamic";

/** Виконавець із сіда dev-бази: id виду me-demo-…, вигаданий. */
const isDemo = (id: string) => id.startsWith("me-demo-");

const idOf = async (params: Props["params"]) => {
  const { id } = await params;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

const load = cache(getPublicProfile);

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const id = await idOf(params);
  const profile = await load(id);
  if (!profile) return { title: "Профіль не знайдено", robots: { index: false } };
  const title = `${profile.name}: ${profile.specialty}, ${profile.city}`;
  const description = profile.bio.slice(0, 160) || `${profile.specialty} у місті ${profile.city}. Роботи, відгуки й можливість описати задачу.`;
  const url = `${siteUrl()}/p/${encodeURIComponent(id)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Свій openGraph замінює кореневий цілком, тож картинку для превью повторюємо.
    openGraph: { title, description, type: "profile", locale: "uk_UA", url, images: ["/og.png"] },
    // Демо-виконавців з сіда вигадані: в індекс не пускаємо. Ключа `robots` без значення не лишаємо: `undefined` стер би
    // заборону з кореневого layout.
    ...(isDemo(id) ? { robots: { index: false, follow: true } } : {}),
  };
};

const ProfilePage = async ({ params }: Props) => {
  const id = await idOf(params);
  const profile = await load(id);
  if (!profile) notFound();
  return (
    <>
      {!isDemo(id) && <JsonLd data={profileJsonLd(profile, `${siteUrl()}/p/${encodeURIComponent(id)}`)} />}
      <ProfilePageView profile={profile} />
    </>
  );
};

export default ProfilePage;
