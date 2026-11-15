// /api/notifications/preferences — що людина хоче отримувати й де.
// GET — {prefs, stored}: stored = false, поки людина нічого не зберігала (клієнт тоді переносить свій вибір із localStorage);
// PUT — часткове оновлення {channels?, kinds?, quietHours?}, зливається з поточним.

import { problem, readJson } from "@/lib/api/problem";
import { getPrefs, hasStoredPrefs, savePrefs } from "@/lib/server/notification-prefs-repo";
import { route } from "@/lib/server/route";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const [prefs, stored] = await Promise.all([getPrefs(user.id), hasStoredPrefs(user.id)]);
  return Response.json({ prefs, stored }, { headers: { "cache-control": "no-store" } });
});

export const PUT = route({ auth: "user" }, async ({ request, user }) => {
  const body = await readJson(request);
  if (!body) return problem(400, "Порожній запит");
  return Response.json({ prefs: await savePrefs(user.id, body) });
});
