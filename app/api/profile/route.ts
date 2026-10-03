// /api/profile — профіль виконавця поточної людини.
// GET — свій профіль або {profile: null}; PUT — зберегти (чернетку або
// опублікувати); DELETE — видалити профіль і зняти з карти.
// D1: profiles, projects, profile_tags. Фото поки data URL, потім R2.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { deleteProfile, getProfile, saveProfile } from "@/lib/server/profile-repo";
import { deleteByUrl, keyFromUrl, putPhotoFromDataUrl } from "@/lib/server/uploads";
import { parseProfile } from "@/lib/profile/validate";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ profile: await getProfile(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
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
  // Попереднє фото більше не потрібне: прибираємо з R2, щоб не копити сміття.
  if (previous?.photo && previous.photo !== saved.photo) await deleteByUrl(previous.photo, user.id);
  return Response.json({ profile: saved });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  await deleteProfile(user.id);
  return new Response(null, { status: 204 });
}
