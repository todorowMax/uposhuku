// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

// Onest несе українську кирилицю (і, ї, є, ґ), та сама гарнітура, що в mealcart.
const onest = Onest({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vibe Map: виконавці й запити на карті України",
  description:
    "Опиши, що потрібно створити, і побач на карті, хто поруч уже робив схоже. " +
    "Реальні проєкти, реальні люди, з точністю до міста.",
};

export const viewport: Viewport = {
  themeColor: "#f4f6fa",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className={onest.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
