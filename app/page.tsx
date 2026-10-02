// app/page.tsx
import { AccountButton } from "@/components/account/account-button";
import { NotificationSettings } from "@/components/account/notification-settings";
import { TabBadge } from "@/components/account/tab-badge";
import { DealSync } from "@/lib/deals/client";
import { MapRequestsSync } from "@/lib/feed/map-requests";
import { RequestComposer } from "@/components/composer/request-composer";
import { PlacementPanel } from "@/components/placement/placement-panel";
import { ProfileEditorHost } from "@/components/profile/profile-editor";
import { ProfileViewHost } from "@/components/profile/profile-view";
import { MapSkeleton } from "@/components/map-skeleton";
import { FeedPanel } from "@/components/requests/feed-panel";
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
      <DealSync />
      <MapRequestsSync />
      <TabBadge />
      <NotificationSettings />
      <OffersPanel />
      <FeedPanel />
      <ProfileEditorHost />
      <ProfileViewHost />
      <PlacementPanel />
    </main>
  );
}
