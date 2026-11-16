"use client";

// components/profile/profile-view.tsx
//
// Повний профіль виконавця: фото, цифри, «Про себе» без обрізання, роботи сіткою (клік — опис, теги, посилання),
// теги й відгуки. Малює сторінка /p/[id]; `initial` і `initialLabels` приходять із сервера, щоб у першому HTML уже
// був текст профілю. Це екран за DESIGN.md («Шари»): на телефоні на весь екран, від 768 px вікно по центру.
// Логіка в `use-profile-view.ts`.

import { Loader2 } from "@/components/icons";
import { ProfileContactBar } from "@/components/profile/parts/profile-contact-bar";
import { ProfileViewBody } from "@/components/profile/parts/profile-view-body";
import { ProfileViewReviews } from "@/components/profile/parts/profile-view-reviews";
import { useProfileView } from "@/components/profile/use-profile-view";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import type { Performer } from "@/lib/map/types";
import { placementOpenStore } from "@/lib/placement/client";
import { profileEditorStore } from "@/lib/profile/client";

export namespace ProfileViewScreenTypes {
  export type Props = {
    id: string;
    initial: Performer | null;
    initialLabels?: Record<string, string>;
  };
}

export const ProfileView = ({ id, initial, initialLabels = {} }: ProfileViewScreenTypes.Props) => {
  const view = useProfileView(id, initial, initialLabels);
  const { performer } = view;
  const footer = performer ? (
    performer.mine ? (
      <Button className="w-full" onClick={() => profileEditorStore.set(true)}>
        Редагувати профіль
      </Button>
    ) : (
      <ProfileContactBar performerName={performer.name} hasDialog={view.dialog} onOpenChat={view.openChat} onStart={view.startTask} onSend={view.sendTask} />
    )
  ) : undefined;
  return (
    <Screen
      open={view.open}
      onOpenChange={(next) => !next && view.close()}
      title={performer?.name ?? "Профіль виконавця"}
      description="Повний профіль виконавця: опис, роботи, теги й відгуки."
      desktop="dialog"
      action={
        performer?.mine ? (
          <Button variant="quiet" onClick={() => placementOpenStore.set(true)}>
            Підняти на карті
          </Button>
        ) : undefined
      }
      footer={footer}
    >
      {!performer ? (
        <div className="grid place-items-center py-24 text-sm text-ink-muted">{view.failed ? <p>Профіль не знайдено. Можливо, виконавець зняв його з карти.</p> : <Loader2 className="size-6 animate-spin" />}</div>
      ) : (
        <div className="pv-layout">
          <ProfileViewBody performer={performer} reviews={view.reviews} stats={view.stats} city={view.city} labels={view.labels} tags={view.tags} proven={view.proven} />
          <ProfileViewReviews reviews={view.reviews} stats={view.stats} />
        </div>
      )}
    </Screen>
  );
};
