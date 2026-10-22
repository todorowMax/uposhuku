// app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Telemetry } from "@/kit/telemetry/client";
import { ConsentBanner } from "@/components/legal/consent-banner";

const fixel = localFont({
  src: "../public/fonts/FixelVariable.ttf",
  variable: "--font-fixel",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  // Закрито від індексації, доки не запустимось публічно (також X-Robots-Tag у worker/index.ts і app/robots.ts).
  robots: { index: false, follow: false },
  title: "Findlyfy: виконавці й запити на карті України",
  description:
    "Опиши, що потрібно створити, і побач на карті, хто поруч уже робив схоже. " +
    "Реальні проєкти, реальні люди, з точністю до міста.",
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
