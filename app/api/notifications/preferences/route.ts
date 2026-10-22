// /api/notifications/preferences — що людина хоче отримувати й де.
// GET — {prefs, stored}: stored = false, поки людина нічого не зберігала (клієнт тоді переносить свій вибір із localStorage);
// PUT — часткове оновлення {channels?, kinds?, quietHours?}, зливається з поточним.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { getPrefs, hasStoredPrefs, savePrefs } from "@/lib/server/notification-prefs-repo";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const [prefs, stored] = await Promise.all([getPrefs(user.id), hasStoredPrefs(user.id)]);
  return Response.json({ prefs, stored }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  if (!body) return problem(400, "Порожній запит");
  return Response.json({ prefs: await savePrefs(user.id, body) });
}
