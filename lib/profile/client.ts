// lib/profile/client.ts
//
// Профіль виконавця в браузері: відкритий редактор, збережений профіль,
// виклики /api/profile. Опублікований профіль одразу з'являється на карті
// (lib/map/performers.ts).

import { ApiError, sessionStore } from "@/lib/auth/client";
import { setMyPerformer } from "@/lib/map/performers";
import { forgetPlacement, loadPlacement } from "@/lib/placement/client";
import { registerCustomAvatar } from "@/lib/map/portrait";
import { createStore } from "@/lib/store";
import { profileToPerformer } from "./to-performer";
import type { Profile } from "./types";

export type ProfileState = { status: "loading" } | { status: "ready"; profile: Profile | null };
export const profileStore = createStore<ProfileState>({ status: "loading" });

/** Редактор профілю відкритий. */
export const profileEditorStore = createStore(false);
/** Просять карту показати щойно опублікованого виконавця. */
export const justPublishedStore = createStore<{ id: string; at: number } | null>(null);

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Немає зв'язку. Перевірте інтернет і спробуйте ще раз.");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string }) | null;
  if (!response.ok) throw new ApiError(data?.detail ?? data?.title ?? "Щось пішло не так. Спробуйте ще раз.");
  return data as T;
};

/** Профіль на карті: фото реєструємо для малювання маркера, потім кладемо у список. */
const putOnMap = async (profile: Profile | null) => {
  const session = sessionStore.get();
  if (!profile || !profile.published || session.status !== "user") {
    setMyPerformer(null);
    return null;
  }
  const avatarIndex = profile.photo ? await registerCustomAvatar(profile.photo) : 0;
  // Рівень — за оплатою розміщення; завантажуємо, щоб маркер одразу був правильного розміру.
  const placement = (await loadPlacement()) ?? null;
  const performer = profileToPerformer(profile, session.user.id, avatarIndex, placement?.tier ?? 1);
  setMyPerformer(performer);
  return performer;
};

export const loadMyProfile = async () => {
  try {
    const { profile } = await call<{ profile: Profile | null }>("/api/profile");
    profileStore.set({ status: "ready", profile });
    await putOnMap(profile);
  } catch {
    profileStore.set({ status: "ready", profile: null });
  }
};

/** Зберегти чернетку або опублікувати. Опублікованого показуємо на карті. */
export const saveMyProfile = async (profile: Profile) => {
  const { profile: saved } = await call<{ profile: Profile }>("/api/profile", { method: "PUT", body: JSON.stringify(profile) });
  profileStore.set({ status: "ready", profile: saved });
  const performer = await putOnMap(saved);
  if (performer) justPublishedStore.set({ id: performer.id, at: Date.now() });
  return saved;
};

export const removeMyProfile = async () => {
  await call<void>("/api/profile", { method: "DELETE" });
  profileStore.set({ status: "ready", profile: null });
  setMyPerformer(null);
};

/** Вихід з акаунта: профіль з карти зникає. */
export const forgetProfile = () => {
  forgetPlacement();
  profileStore.set({ status: "loading" });
  setMyPerformer(null);
  profileEditorStore.set(false);
};
