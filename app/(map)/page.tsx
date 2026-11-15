import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/server/env";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";

// Канонічна адреса головної (metadataBase з кореневого layout робить її абсолютною).
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Адресу сайту знає лише воркер під час запиту: без цього розмітка зібралась би на збірці з адресою за замовчуванням.
export const dynamic = "force-dynamic";

// Головна: усе малює layout, карта над нею. Видимого заголовка немає, але він потрібен скрінрідеру й пошуку.
// Organization і WebSite JSON-LD лише тут; видимого серверного блоку під картою немає (питання власнику, див. задачу).
const HomePage = () => {
  const site = siteUrl();
  return (
    <>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={websiteJsonLd(site)} />
      <h1 className="sr-only">Findlyfy: виконавці й запити на карті України</h1>
    </>
  );
};

export default HomePage;
