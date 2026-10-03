// /api/profile — профіль виконавця поточної людини.
// GET — свій профіль або {profile: null}; PUT — зберегти (чернетку або
// опублікувати); DELETE — видалити профіль і зняти з карти.
// Справжня версія: D1 (profiles, projects, profile_tags), фото в R2.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { deleteProfile, getProfile, saveProfile } from "@/lib/profile/mock-store";
import { parseProfile } from "@/lib/profile/validate";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ profile: getProfile(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const profile = parseProfile(await readJson(request));
  if (typeof profile === "string") return problem(400, "Профіль не збережено", profile);
  return Response.json({ profile: saveProfile(user.id, profile) });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  deleteProfile(user.id);
  return new Response(null, { status: 204 });
}
