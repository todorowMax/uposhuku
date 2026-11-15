// app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { connection } from "next/server";
import { Telemetry } from "@/kit/telemetry/client";
import { ConsentBanner } from "@/components/legal/consent-banner";
import { siteRobots } from "@/lib/server/seo";
import { siteUrl } from "@/lib/server/env";

const fixel = localFont({
  src: "../public/fonts/FixelVariable.woff2",
  variable: "--font-fixel",
  weight: "100 900",
  display: "swap",
});

const SITE_TITLE = "Findlyfy: виконавці й запити на карті України";
const SITE_DESCRIPTION =
  "Опиши, що потрібно створити, і побач на карті, хто поруч уже робив схоже. " +
  "Реальні проєкти, реальні люди, з точністю до міста.";

// Картинка для превью посилань: public/og.png, 1200×630. Адреса абсолютна через metadataBase.
const SOCIAL_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: SITE_TITLE };

// Адреса сайту й індексація приходять зі змінних воркера (SITE_URL, DEPLOY_ENV, SEO_INDEXING), а вони відомі
// лише під час запиту: connection() не дає зібрати метадані на збірці з адресою за замовчуванням.
export const generateMetadata = async (): Promise<Metadata> => {
  await connection();
  return {
    metadataBase: new URL(siteUrl()),
    // Закрито, поки не відкрито явно: lib/seo/indexing.ts (так само X-Robots-Tag у worker/index.ts і app/robots.ts).
    robots: siteRobots(),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, siteName: "Findlyfy", locale: "uk_UA", type: "website", url: "/", images: [SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SOCIAL_IMAGE.url] },
  };
};

export const viewport: Viewport = {
  themeColor: "#03090d",
  viewportFit: "cover",
  // Клавіатура зменшує область сторінки, а не лише перекриває її: нижні панелі лишаються над нею.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Розширення браузера (LanguageTool, Grammarly тощо) дописують на <html>
    // свої атрибути ще до гідратації, і React лається на розбіжність.
    // suppressHydrationWarning діє лише на атрибути самого <html>, не на
    // вміст сторінки. data-map-ready ставимо вже після гідратації.
    <html lang="uk" className={fixel.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        {/* Помилки браузера, перегляди сторінок і аналітика: kit/telemetry. */}
        <Telemetry storagePrefix="vm" />
        <ConsentBanner />
      </body>
    </html>
  );
}
