"use client";

import { useEffect } from "react";
import { Code2, MapPinned, UserRound } from "@/components/icons";
import { AccountMenu } from "@/components/account/account-menu";
import { LegendButton } from "@/components/map/legend";
import { authFlowStore, loadSession, sessionStore } from "@/lib/auth/client";
import { useStore } from "@/lib/store";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { EVENTS, track } from "@/lib/telemetry/track";

/**
 * Акаунт по центру знизу, щоб угорі лишалось лише поле запиту.
 * Гість бачить «Увійти»; після входу — кружечок з першою літерою й меню
 * вгору: мої запити, стати виконавцем, вийти. Поруч — скільки виконавців
 * під запит; на телефоні цю плашку ховаємо: те саме число є в чипі «Усі».
 */
export function AccountButton() {
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  const profile = profileState.status === "ready" ? profileState.profile : null;

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
      <AccountMenu initial={initial} name={user.name} email={user.email} />
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
