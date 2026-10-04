"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Code2, Inbox, ListChecks, LogOut, MapPinned, UserRound } from "@/components/icons";
import { notificationSettingsStore } from "@/components/account/notification-settings";
import { LegendButton } from "@/components/map/legend";
import { authFlowStore, loadSession, logout, requestsStore, sessionStore, showMyRequests } from "@/lib/auth/client";
import { useStore } from "@/lib/store";
import { feedCountStore } from "@/lib/feed/client";
import { setMapMode } from "@/lib/feed/map-requests";
import { placementOpenStore, placementStore } from "@/lib/placement/client";
import { TIER_NAMES } from "@/lib/placement/tiers";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { feedCollapsedStore, useIsPerformer } from "@/lib/requests/side-panel";

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadSession();
  }, []);

  // Повернулися з Google, куди йшли створювати профіль виконавця: відкриваємо редактор.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "performer") return;
    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    profileEditorStore.set(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        <button type="button" onClick={() => authFlowStore.set({ mode: "performer" })} className="account-login account-performer">
          <MapPinned className="size-4" />
          <span className="account-performer-short">На мапу</span>
          <span className="account-performer-full">Зʼявитися на мапі</span>
        </button>
        <LegendButton />
      </div>
    );
  }

  const { user } = session;
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  return (
    <div ref={rootRef} className="account-slot">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Акаунт ${user.email}`}
        className="account-avatar"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="account-menu glass-panel">
          <div className="px-3 pb-2 pt-1">
            {user.name && <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>}
            <p className="truncate text-[12px] text-ink-muted">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              showMyRequests();
            }}
            disabled={!requests?.length}
            className="account-menu-item"
          >
            <ListChecks className="size-4" />
            Мої запити
            {Boolean(requests?.length) && <span className="ml-auto text-[11px] text-ink-muted">{requests?.length}</span>}
          </button>
          {performer && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setMapMode("requests");
                feedCollapsedStore.set(false);
              }}
              className="account-menu-item"
            >
              <Inbox className="size-4" />
              Запити для вас
              {feedCount > 0 && <span className="ml-auto text-[11px] text-ink-muted">{feedCount}</span>}
            </button>
          )}
          {performer && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                placementOpenStore.set(true);
              }}
              className="account-menu-item"
            >
              <MapPinned className="size-4" />
              Стати на карту
              <span className="ml-auto text-[11px] text-ink-muted">{TIER_NAMES[placement?.tier ?? 1]}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              profileEditorStore.set(true);
            }}
            className="account-menu-item"
          >
            <UserRound className="size-4" />
            {profile ? "Мій профіль" : "Стати виконавцем"}
            {profile && <span className="ml-auto text-[11px] text-ink-muted">{!profile.published ? "чернетка" : (placement?.tier ?? 1) >= 2 ? "на карті" : "не на карті"}</span>}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              notificationSettingsStore.set(true);
            }}
            className="account-menu-item"
          >
            <Bell className="size-4" />
            Сповіщення
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="account-menu-item"
          >
            <LogOut className="size-4" />
            Вийти
          </button>
        </div>
      )}
      {!profile && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            profileEditorStore.set(true);
          }}
          className="account-login account-performer"
        >
          <Code2 className="size-4" />
          <span className="account-performer-short">Профіль</span>
          <span className="account-performer-full">Стати розробником</span>
        </button>
      )}
      <LegendButton />
    </div>
  );
}
