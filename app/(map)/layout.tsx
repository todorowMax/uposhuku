// app/(map)/layout.tsx
//
// Карта й усе, що над нею, живуть тут, а не в page.tsx: при переході між
// головною й профілем виконавця (/p/[id]) вони не перестворюються.
import { AccountButton } from "@/components/account/account-button";
import { NotificationSettings } from "@/components/account/notification-settings";
import { DeleteAccountScreen } from "@/components/account/delete-account-screen";
import { ExportDataScreen } from "@/components/account/export-data-screen";
import { TabBadge } from "@/components/account/tab-badge";
import { ChromeReveal } from "@/components/map/chrome-reveal";
import { MapModeSwitch } from "@/components/map/mode-switch";
import { DeepLinkSync } from "@/components/map/deep-link-sync";
import { LegalSheets } from "@/components/legal/legal-sheets";
import { DealSync } from "@/lib/deals/client";
import { PaymentReturnSync } from "@/lib/deals/use-payment-return";
import { MapRequestsSync } from "@/lib/feed/map-requests";
import { RealPerformersSync } from "@/lib/map/performers-sync";
import { RealtimeSync } from "@/lib/realtime/client";
import { RequestComposer } from "@/components/composer/request-composer";
import { FeedPanelGate, OffersPanelGate, PanelPreload } from "@/components/map/lazy-panels";
import { FeesHost } from "@/components/fees/fees-host";
import { PlacementPanel } from "@/components/placement/placement-host";
import { InboxPanel } from "@/components/chat/inbox/inbox-panel";
import { DirectChatSync } from "@/components/profile/direct-chat-sync";
import { ProfileEditorHost } from "@/components/profile/profile-editor-host";
import { MapSkeleton } from "@/components/map-skeleton";
import { VibeMap } from "@/components/maplibre/vibe-map";

/* Карта на весь екран, поле запиту над нею, нижні панелі в одному ряду. */
export default function MapLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="map-page relative h-dvh w-full overflow-clip">
      <a href="#request" className="skip-link">
        Перейти до поля запиту
      </a>
      {/* Заставка в першому HTML: видна до завантаження JS карти. */}
      <MapSkeleton />
      <VibeMap />
      <RequestComposer />
      <div className="bottom-controls">
        <AccountButton />
        <MapModeSwitch />
      </div>
      <ChromeReveal />
      <DeepLinkSync />
      <DealSync />
      <PaymentReturnSync />
      <MapRequestsSync />
      <RealPerformersSync />
      <RealtimeSync />
      <TabBadge />
      <NotificationSettings />
      <ExportDataScreen />
      <DeleteAccountScreen />
      <OffersPanelGate />
      <FeedPanelGate />
      <ProfileEditorHost />
      <PlacementPanel />
      <FeesHost />
      <DirectChatSync />
      <InboxPanel />
      <PanelPreload />
      <LegalSheets />
      {children}
    </main>
  );
}
