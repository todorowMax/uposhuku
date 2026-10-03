// /api/profile — профіль виконавця поточної людини.
// GET — свій профіль або {profile: null}; PUT — зберегти (чернетку або
// опублікувати); DELETE — видалити профіль і зняти з карти.
// D1: profiles, projects, profile_tags. Фото поки data URL, потім R2.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { deleteProfile, getProfile, saveProfile } from "@/lib/server/profile-repo";
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
  return Response.json({ profile: await saveProfile(user.id, profile) });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  await deleteProfile(user.id);
  return new Response(null, { status: 204 });
}
