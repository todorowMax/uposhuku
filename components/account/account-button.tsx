"use client";

import { useEffect } from "react";
import { Bell, Code2, FileText, Inbox, ListChecks, LogOut, MapPinned, Trash2, UserRound } from "@/components/icons";
import { notificationSettingsStore } from "@/components/account/notification-settings";
import { deleteScreenStore, exportScreenStore } from "@/lib/account/client";
import { LegendButton } from "@/components/map/legend";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { authFlowStore, loadSession, logout, requestsStore, sessionStore, showMyRequests } from "@/lib/auth/client";
import { useStore } from "@/lib/store";
import { feedCountStore } from "@/lib/feed/client";
import { setMapMode } from "@/lib/feed/map-requests";
import { placementOpenStore, placementStore } from "@/lib/placement/client";
import { TIER_NAMES } from "@/lib/placement/tiers";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { feedCollapsedStore, useIsPerformer } from "@/lib/requests/side-panel";
import { EVENTS, track } from "@/lib/telemetry/track";

/**
 * Акаунт по центру знизу, щоб угорі лишалось лише поле запиту.
 * Гість бачить «Увійти»; після входу — кружечок з першою літерою й меню
 * вгору: мої запити, стати виконавцем, вийти. Поруч — скільки виконавців
 * під запит; на телефоні цю плашку ховаємо: те саме число є в чипі «Усі».
 */
export function AccountButton() {
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  const profileState = useStore(profileStore);
  const profile = profileState.status === "ready" ? profileState.profile : null;
  const performer = useIsPerformer();
  const feedCount = useStore(feedCountStore);
  const placement = useStore(placementStore);

  useEffect(() => {
    void loadSession();
  }, []);

  // Повернулися з Google, куди йшли створювати профіль виконавця: відкриваємо редактор.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "performer") return;
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    profileEditorStore.set(true);
  }, []);

  if (session.status === "loading") {
    return (
      <div className="account-slot account-slot-guest">
        <span aria-hidden className="size-12" />
        <LegendButton />
      </div>
    );
  }

  if (session.status === "guest") {
    return (
      <div className="account-slot account-slot-guest">
        <button type="button" onClick={() => authFlowStore.set({ mode: "login" })} className="account-login">
          <UserRound className="size-4" />
          <span>Увійти</span>
        </button>
        <button
          type="button"
          onClick={() => {
            track(EVENTS.performerCtaClicked, { from: "guest" });
            authFlowStore.set({ mode: "performer" });
          }}
          className="account-login account-performer"
        >
          <MapPinned className="size-4" />
          <span className="account-performer-short">На карту</span>
          <span className="account-performer-full">Зʼявитися на карті</span>
        </button>
        <LegendButton />
      </div>
    );
  }

  const { user } = session;
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  return (
    <div className="account-slot">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="bare" aria-label={`Акаунт ${user.email}`} className="account-avatar">
            {initial}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="account-menu">
          <div className="px-3 pb-2 pt-1">
            {user.name && <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>}
            <p className="truncate text-[12px] text-ink-muted">{user.email}</p>
          </div>
          <DropdownMenuItem onSelect={showMyRequests} disabled={!requests?.length}>
            <ListChecks className="size-4" />
            Мої запити
            {Boolean(requests?.length) && <span className="ml-auto text-[11px] text-ink-muted">{requests?.length}</span>}
          </DropdownMenuItem>
          {performer && (
            <DropdownMenuItem
              onSelect={() => {
                setMapMode("requests");
                feedCollapsedStore.set(false);
              }}
            >
              <Inbox className="size-4" />
              Запити для вас
              {feedCount > 0 && <span className="ml-auto text-[11px] text-ink-muted">{feedCount}</span>}
            </DropdownMenuItem>
          )}
          {performer && (
            <DropdownMenuItem onSelect={() => placementOpenStore.set(true)}>
              <MapPinned className="size-4" />
              Стати на карту
              <span className="ml-auto text-[11px] text-ink-muted">{TIER_NAMES[placement?.tier ?? 1]}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              track(EVENTS.performerCtaClicked, { from: "menu" });
              profileEditorStore.set(true);
            }}
          >
            <UserRound className="size-4" />
            {profile ? "Мій профіль" : "Стати виконавцем"}
            {profile && <span className="ml-auto text-[11px] text-ink-muted">{!profile.published ? "чернетка" : (placement?.tier ?? 1) >= 2 ? "на карті" : "не на карті"}</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => notificationSettingsStore.set(true)}>
            <Bell className="size-4" />
            Сповіщення
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportScreenStore.set(true)}>
            <FileText className="size-4" />
            Завантажити мої дані
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => deleteScreenStore.set(true)}>
            <Trash2 className="size-4" />
            Видалити акаунт
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut className="size-4" />
            Вийти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!profile && (
        <button
          type="button"
          onClick={() => {
            track(EVENTS.performerCtaClicked, { from: "banner" });
            profileEditorStore.set(true);
          }}
          className="account-login account-performer"
        >
          <Code2 className="size-4" />
          <span className="account-performer-short">Профіль</span>
          <span className="account-performer-full">Стати виконавцем</span>
        </button>
      )}
      <LegendButton />
    </div>
  );
}
