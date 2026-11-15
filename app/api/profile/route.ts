// /api/profile — профіль виконавця поточної людини.
// GET — свій профіль або {profile: null}; PUT — зберегти (чернетку або
// опублікувати); DELETE — видалити профіль і зняти з карти.
// D1: profiles, projects, profile_tags. Фото поки data URL, потім R2.

import { problem, readJson } from "@/lib/api/problem";
import { deleteProfile, getProfile, saveProfile } from "@/lib/server/profile-repo";
import { pushGlobal } from "@/lib/server/realtime";
import { deleteByUrl, keyFromUrl, putPhotoFromDataUrl } from "@/lib/server/uploads";
import { parseProfile } from "@/lib/profile/validate";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { route } from "@/lib/server/route";

export const GET = route({ auth: "user" }, async ({ user }) => {
  return Response.json({ profile: await getProfile(user.id) }, { headers: { "cache-control": "no-store" } });
});

export const PUT = route({ auth: "user", rate: "profileSave" }, async ({ request, user }) => {
  const profile = parseProfile(await readJson(request));
  if (typeof profile === "string") return problem(400, "Профіль не збережено", profile);
  const previous = await getProfile(user.id);
  // Нове фото приходить data URL: кладемо в R2, у профілі лишається адреса. Свою адресу
  // залишаємо як є, чужу відкидаємо.
  if (profile.photo.startsWith("data:")) {
    const stored = await putPhotoFromDataUrl(user.id, profile.photo);
    if (typeof stored === "string") return problem(400, "Профіль не збережено", stored);
    profile.photo = stored.url;
  } else if (profile.photo && !keyFromUrl(profile.photo, user.id)) {
    return problem(400, "Профіль не збережено", "Фото не знайдено. Завантажте його ще раз.");
  }
  const saved = await saveProfile(user.id, profile);
  serverEvent(EVENTS.profileSaved, { published: saved.published, tags: saved.tags.length, manual_tags: saved.manualTags.length, works: saved.works.length, has_location: Boolean(saved.location) }, user.id, "/api/profile");
  // Уперше опублікований: до цього профіль був чернеткою чи його не було.
  if (saved.published && !previous?.published) serverEvent(EVENTS.profilePublished, undefined, user.id, "/api/profile");
  // Попереднє фото більше не потрібне: прибираємо з R2, щоб не копити сміття.
  if (previous?.photo && previous.photo !== saved.photo) await deleteByUrl(previous.photo, user.id);
  pushGlobal({ t: "map" });
  return Response.json({ profile: saved });
});

export const DELETE = route({ auth: "user" }, async ({ user }) => {
  await deleteProfile(user.id);
  pushGlobal({ t: "map" });
  return new Response(null, { status: 204 });
});
