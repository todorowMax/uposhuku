// app/page.tsx
import { AccountButton } from "@/components/account/account-button";
import { RequestComposer } from "@/components/composer/request-composer";
import { MapSkeleton } from "@/components/map-skeleton";
import { OffersPanel } from "@/components/requests/offers-panel";
import { VibeMap } from "@/components/maplibre/vibe-map";

/* Карта на весь екран, поле запиту над нею, акаунт у лівому нижньому куті. */
export default function HomePage() {
  return (
    <main className="relative h-dvh w-full overflow-clip">
      {/* Заставка в першому HTML: видна до завантаження JS карти. */}
      <MapSkeleton />
      <VibeMap />
      <RequestComposer />
      <AccountButton />
      <OffersPanel />
    </main>
  );
}
