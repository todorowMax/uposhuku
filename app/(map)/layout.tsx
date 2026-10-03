// app/(map)/layout.tsx
//
// Карта й усе, що над нею, живуть тут, а не в page.tsx: при переході між
// головною й профілем виконавця (/p/[id]) вони не перестворюються.
import { AccountButton } from "@/components/account/account-button";
import { NotificationSettings } from "@/components/account/notification-settings";
import { TabBadge } from "@/components/account/tab-badge";
import { MapModeSwitch } from "@/components/map/mode-switch";
import { DealSync } from "@/lib/deals/client";
import { MapRequestsSync } from "@/lib/feed/map-requests";
import { RealPerformersSync } from "@/lib/map/performers-sync";
import { RealtimeSync } from "@/lib/realtime/client";
import { RequestComposer } from "@/components/composer/request-composer";
import { PlacementPanel } from "@/components/placement/placement-panel";
import { InboxPanel } from "@/components/chat/inbox-panel";
import { DirectChatSync } from "@/components/profile/direct-chat-sync";
import { ProfileEditorHost } from "@/components/profile/profile-editor";
import { MapSkeleton } from "@/components/map-skeleton";
import { FeedPanel } from "@/components/requests/feed-panel";
import { OffersPanel } from "@/components/requests/offers-panel";
import { VibeMap } from "@/components/maplibre/vibe-map";

/* Карта на весь екран, поле запиту над нею, акаунт у лівому нижньому куті. */
export default function MapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="relative h-dvh w-full overflow-clip">
      {/* Заставка в першому HTML: видна до завантаження JS карти. */}
      <MapSkeleton />
      <VibeMap />
      <RequestComposer />
      <AccountButton />
      <MapModeSwitch />
      <DealSync />
      <MapRequestsSync />
      <RealPerformersSync />
      <RealtimeSync />
      <TabBadge />
      <NotificationSettings />
      <OffersPanel />
      <FeedPanel />
      <ProfileEditorHost />
      <PlacementPanel />
      <DirectChatSync />
      <InboxPanel />
      {children}
    </main>
  );
}
