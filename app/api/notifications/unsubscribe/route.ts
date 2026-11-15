// /api/notifications/unsubscribe?token= — відписка від листів-сповіщень одним кліком, без входу.
// Токен підписаний (lib/server/unsubscribe-token.ts) і несе лише id людини; підроблений чи чужий дає 400.
// GET: людина натиснула посилання в листі, відповідь сторінка з підтвердженням.
// POST: поштові клієнти за List-Unsubscribe-Post (RFC 8058) відписують без переходу на сайт.

import { problem } from "@/lib/api/problem";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { siteUrl } from "@/lib/server/env";
import { savePrefs } from "@/lib/server/notification-prefs-repo";
import { verifyUnsubscribeToken } from "@/lib/server/unsubscribe-token";
import { route } from "@/lib/server/route";

const page = (status: number, title: string, text: string) =>
  new Response(
    `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>` +
      `<body style="font-family:sans-serif;line-height:1.5;max-width:480px;margin:48px auto;padding:0 16px"><h1 style="font-size:20px">${title}</h1><p>${text}</p><p><a href="${siteUrl()}">Повернутися до Findlyfy</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

/** Вимикає лист для людини; для видаленого акаунта нічого не пишемо, але відповідь та сама. */
const unsubscribe = async (token: string | null): Promise<boolean> => {
  const userId = await verifyUnsubscribeToken(token);
  if (!userId) return false;
  const [user] = await getDb().select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (user && user.deletedAt === null) await savePrefs(userId, { channels: { email: false } });
  return true;
};

export const GET = route({}, async ({ request }) => {
  if (await unsubscribe(new URL(request.url).searchParams.get("token"))) {
    return page(200, "Ви відписалися від листів", "Листів про нові повідомлення, відгуки й угоди більше не буде. Увімкнути їх знову можна в налаштуваннях сповіщень.");
  }
  return page(400, "Посилання не спрацювало", "Воно пошкоджене або не від нас. Вимкнути листи можна в налаштуваннях сповіщень на сайті.");
});

export const POST = route({}, async ({ request }) => {
  if (await unsubscribe(new URL(request.url).searchParams.get("token"))) return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
  return problem(400, "Посилання не спрацювало", "Токен відписки пошкоджений або не від нас.");
});
