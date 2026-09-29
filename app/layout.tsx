// app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fixel = localFont({
  src: "../public/fonts/FixelVariable.ttf",
  variable: "--font-fixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vibe Map: виконавці й запити на карті України",
  description:
    "Опиши, що потрібно створити, і побач на карті, хто поруч уже робив схоже. " +
    "Реальні проєкти, реальні люди, з точністю до міста.",
};

export const viewport: Viewport = {
  themeColor: "#b9c0ca",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Розширення браузера (LanguageTool, Grammarly тощо) дописують на <html>
    // свої атрибути ще до гідратації, і React лається на розбіжність.
    // suppressHydrationWarning діє лише на атрибути самого <html>, не на
    // вміст сторінки. data-map-ready ставимо вже після гідратації.
    <html lang="uk" className={fixel.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
