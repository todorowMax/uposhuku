"use client";

// components/profile/use-profile-editor.ts
//
// Логіка редактора профілю виконавця: поля, теги з тексту, «було — стало», збереження, закриття з питанням про
// незбережене. Розмітка в `profile-editor.tsx` і `parts/`. Перенесено з компонента без зміни поведінки.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, sessionStore } from "@/lib/auth/client";
import { CITIES } from "@/lib/map/cities";
import { SAME_CITY_KM, distanceKm, nearestCity } from "@/lib/map/nearest-city";
import { loadPlacement, placementOpenStore, placementStore } from "@/lib/placement/client";
import { profileEditorStore, profileStore, saveMyProfile } from "@/lib/profile/client";
import { profileToPerformer } from "@/lib/profile/to-performer";
import { PROFILE_LIMITS, emptyProfile, emptyWork, missingForPublish, profileTags, provenTags, type Profile, type ProfileWork } from "@/lib/profile/types";
import { useStore } from "@/lib/store";
import { useProposals } from "@/lib/tags/proposals-client";
import { useTagging } from "@/lib/tags/use-tagging";
import { EVENTS, track } from "@/lib/telemetry/track";

export namespace ProfileEditorTypes {
  export type Save = "publish" | "draft" | "unpublish";
  /** Поля блоку «Про вас»: фото, імʼя, місто, точка, спеціальність. */
  export type About = Pick<Profile, "name" | "cityId" | "location" | "specialty" | "photo">;
}

const newWork = (): ProfileWork => emptyWork(`w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);

/** Те, що людина змінює: без часу збереження, щоб порівнювати «було — стало». */
const snapshot = (profile: Profile) => JSON.stringify({ ...profile, updatedAt: "" });

export const useProfileEditor = () => {
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  const stored = profileState.status === "ready" ? profileState.profile : null;
  const userName = session.status === "user" ? (session.user.name ?? "") : "";
  const placement = useStore(placementStore);
  // Без оплати профіль опубліковано, але на карті людини немає.
  const onMap = (placement?.tier ?? 1) >= 2;
  // Було профіль чи ні на момент відкриття: для події, лишається незмінним.
  const [hadProfile] = useState(() => Boolean(stored));

  useEffect(() => {
    void loadPlacement();
    // Один раз за відкриття редактора.
    track(EVENTS.profileEditorOpened, { has_profile: hadProfile });
  }, [hadProfile]);

  const [name, setName] = useState(stored?.name ?? userName);
  const [cityId, setCityId] = useState(stored?.cityId ?? "");
  const [location, setLocation] = useState<Profile["location"]>(stored?.location ?? null);
  const [picking, setPicking] = useState(false);
  const [specialty, setSpecialty] = useState(stored?.specialty ?? "");
  const [bio, setBio] = useState(stored?.bio ?? "");
  const [photo, setPhoto] = useState(stored?.photo ?? "");
  const [works, setWorks] = useState<ProfileWork[]>(stored?.works ?? []);
  const [busy, setBusy] = useState<ProfileEditorTypes.Save | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  /** «Було»: знімок того, що відкрилось або збереглось останнім; `null`, поки словник тегів вантажиться. */
  const [baseline, setBaseline] = useState<string | null>(null);

  // Спеціальність і «Про себе» — один текст для тегів; підкреслюємо лише в «Про себе».
  const proposals = useProposals("profile");
  const tagging = useTagging(`${specialty}\n${bio}`, { tags: stored?.tags, manual: stored?.manualTags, hidden: stored?.hiddenTags }, { maxTags: PROFILE_LIMITS.tags, maxManual: PROFILE_LIMITS.manualTags, context: "profile" });
  const bioOffset = specialty.length + 1;
  const bioMentions = tagging.mentions
    .filter((mention) => mention.start >= bioOffset)
    .map((mention) => ({ ...mention, start: mention.start - bioOffset, end: mention.end - bioOffset }));

  const draft: Profile = useMemo(
    () => ({
      ...emptyProfile(),
      name,
      cityId,
      location,
      specialty,
      bio,
      tags: tagging.tags,
      manualTags: tagging.manual,
      hiddenTags: tagging.hidden,
      works,
      photo,
      published: stored?.published ?? false,
    }),
    [name, cityId, location, specialty, bio, tagging.tags, tagging.manual, tagging.hidden, works, photo, stored?.published]
  );
  const proven = useMemo(() => provenTags(draft), [draft]);
  const allTags = useMemo(() => profileTags(draft), [draft]);
  const missing = missingForPublish(draft);
  const isPublished = Boolean(stored?.published);

  // «Було» запам'ятовуємо, коли словник підвантажився: до того теги ще порожні.
  if (tagging.engine && baseline === null) setBaseline(snapshot(draft));
  const dirty = baseline !== null && snapshot(draft) !== baseline;

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const requestClose = () => {
    if (dirty && !busy) setConfirmClose(true);
    else profileEditorStore.set(false);
  };

  const save = async (kind: ProfileEditorTypes.Save, closeAfter = false) => {
    setBusy(kind);
    setError(null);
    setConfirmClose(false);
    try {
      const published = kind === "publish" ? true : kind === "unpublish" ? false : isPublished;
      await saveMyProfile({ ...draft, published });
      setBaseline(snapshot({ ...draft, published }));
      if (kind === "publish" || closeAfter) profileEditorStore.set(false);
      else setSaved(true);
      // Опублікувалися, але на карті ще немає: одразу показуємо, як на неї потрапити.
      if (kind === "publish" && (placementStore.get()?.tier ?? 1) < 2) placementOpenStore.set(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося зберегти профіль.");
    } finally {
      setBusy(null);
    }
  };

  const changeAbout = useCallback((patch: Partial<ProfileEditorTypes.About>) => {
    if (patch.name !== undefined) setName(patch.name);
    if (patch.cityId !== undefined) setCityId(patch.cityId);
    if (patch.specialty !== undefined) setSpecialty(patch.specialty);
    if (patch.photo !== undefined) setPhoto(patch.photo);
  }, []);

  /** Точка з карти: місто обираємо за нею, якщо його ще нема або точка далеко від вибраного. */
  const confirmLocation = (point: Profile["location"]) => {
    setLocation(point);
    if (point) {
      const chosen = CITIES.find((city) => city.id === cityId);
      if (!chosen || distanceKm(point, chosen) > SAME_CITY_KM) setCityId(nearestCity(point).city.id);
    }
    setPicking(false);
  };

  const updateWork = (id: string, patch: Partial<ProfileWork>) => setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch } : work)));
  const removeWork = (id: string) => setWorks((current) => current.filter((item) => item.id !== id));
  const addWork = () => {
    const work = newWork();
    setWorks((current) => [...current, work]);
    window.setTimeout(() => document.getElementById(`work-${work.id}-title`)?.focus(), 60);
  };

  const preview = useMemo(() => profileToPerformer({ ...draft, cityId: cityId || "kyiv" }, "preview", 0), [draft, cityId]);
  const cityName = CITIES.find((city) => city.id === cityId)?.name;

  const checks: [string, boolean][] = [
    ["Фото", Boolean(photo)],
    ["Ім'я", Boolean(name.trim())],
    ["Місто", Boolean(cityId)],
    ["Спеціальність", Boolean(specialty.trim())],
    [`${PROFILE_LIMITS.minTags}+ теги`, allTags.length >= PROFILE_LIMITS.minTags],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const about: ProfileEditorTypes.About = { name, cityId, location, specialty, photo };

  return {
    stored,
    onMap,
    about,
    changeAbout,
    bio,
    setBio,
    bioMentions,
    works,
    updateWork,
    removeWork,
    addWork,
    tagging,
    proposals,
    proven,
    allTags,
    missing,
    isPublished,
    dirty,
    busy,
    error,
    saved,
    confirmClose,
    setConfirmClose,
    picking,
    setPicking,
    confirmLocation,
    requestClose,
    save,
    preview,
    cityName,
    checks,
    done,
  };
};

export type ProfileEditor = ReturnType<typeof useProfileEditor>;
