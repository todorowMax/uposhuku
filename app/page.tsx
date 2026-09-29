// app/page.tsx
import { RequestComposer } from "@/components/composer/request-composer";
import { MapEngineSwitch } from "@/components/map-engine-switch";
import { MapSkeleton } from "@/components/map-skeleton";

/*
 * Карта на весь екран і поле запиту над нею. Поки порівнюємо два рушії
 * карти (глобус на globe.gl і MapLibre), між ними перемикач унизу ліворуч.
 */
export default function HomePage() {
  return (
    <main className="relative h-dvh w-full">
      {/* Заставка в першому HTML: видна до завантаження JS карти. */}
      <MapSkeleton />
      <MapEngineSwitch />
      <RequestComposer />
    </main>
  );
}
