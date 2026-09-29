// app/page.tsx
import { RequestComposer } from "@/components/composer/request-composer";
import { MapSkeleton } from "@/components/map-skeleton";
import { VibeMap } from "@/components/maplibre/vibe-map";

/* Карта на весь екран і поле запиту над нею. */
export default function HomePage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* Заставка в першому HTML: видна до завантаження JS карти. */}
      <MapSkeleton />
      <VibeMap />
      <RequestComposer />
    </main>
  );
}
