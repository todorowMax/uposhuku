"use client";

// components/account/use-account-menu.ts
//
// Пункти меню акаунта: що показувати виконавцю й гостю профілю, які лічильники, що робить кожен. Один список на
// два вигляди (випадайка на десктопі, шторка на телефоні), щоб вони не розходились.

import { createElement, type ReactNode } from "react";
import { Bell, FileText, Inbox, ListChecks, LogOut, MapPinned, Trash2, UserRound, Wallet } from "@/components/icons";
import { notificationSettingsStore } from "@/components/account/notification-settings";
import { deleteScreenStore, exportScreenStore } from "@/lib/account/client";
import { logout, requestsStore, showMyRequests } from "@/lib/auth/client";
import { feedCountStore } from "@/lib/feed/client";
import { feesOpenStore, feesStore } from "@/lib/fees/client";
import { debtKop, showFeesItem } from "@/lib/fees/view";
import { formatKop } from "@/lib/deals/price";
import { setMapMode } from "@/lib/feed/map-requests";
import { placementOpenStore, placementStore } from "@/lib/placement/client";
import { TIER_NAMES } from "@/lib/placement/tiers";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { feedCollapsedStore, useIsPerformer } from "@/lib/requests/side-panel";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

export namespace AccountMenuTypes {
  export type Item = {
    id: string;
    icon: ReactNode;
    label: string;
    /** Лічильник чи стан справа. */
    note?: string | number;
    disabled?: boolean;
    run: () => void;
  };
}

const icon = (Icon: typeof Bell) => createElement(Icon, { className: "size-4" });

export const useAccountMenu = (): AccountMenuTypes.Item[] => {
  const requests = useStore(requestsStore);
  const profileState = useStore(profileStore);
  const profile = profileState.status === "ready" ? profileState.profile : null;
  const performer = useIsPerformer();
  const feedCount = useStore(feedCountStore);
  const placement = useStore(placementStore);
  const fees = useStore(feesStore);
  const debt = debtKop(fees?.balanceKop ?? 0);
  const profileNote = !profile ? undefined : !profile.published ? "чернетка" : (placement?.tier ?? 1) >= 2 ? "на карті" : "не на карті";

  const items: (AccountMenuTypes.Item | false)[] = [
    { id: "requests", icon: icon(ListChecks), label: "Мої запити", note: requests?.length || undefined, disabled: !requests?.length, run: showMyRequests },
    performer && {
      id: "feed",
      icon: icon(Inbox),
      label: "Запити для вас",
      note: feedCount > 0 ? feedCount : undefined,
      run: () => {
        setMapMode("requests");
        feedCollapsedStore.set(false);
      },
    },
    performer && { id: "placement", icon: icon(MapPinned), label: "Стати на карту", note: TIER_NAMES[placement?.tier ?? 1], run: () => placementOpenStore.set(true) },
    {
      id: "profile",
      icon: icon(UserRound),
      label: profile ? "Мій профіль" : "Стати виконавцем",
      note: profileNote,
      run: () => {
        track(EVENTS.performerCtaClicked, { from: "menu" });
        profileEditorStore.set(true);
      },
    },
    showFeesItem(fees) && { id: "fees", icon: icon(Wallet), label: "Рахунок", note: debt > 0 ? formatKop(debt) : undefined, run: () => feesOpenStore.set(true) },
    { id: "notifications", icon: icon(Bell), label: "Сповіщення", run: () => notificationSettingsStore.set(true) },
    { id: "export", icon: icon(FileText), label: "Завантажити мої дані", run: () => exportScreenStore.set(true) },
    { id: "delete", icon: icon(Trash2), label: "Видалити акаунт", run: () => deleteScreenStore.set(true) },
    { id: "logout", icon: icon(LogOut), label: "Вийти", run: () => void logout() },
  ];
  return items.filter((item): item is AccountMenuTypes.Item => item !== false);
};
