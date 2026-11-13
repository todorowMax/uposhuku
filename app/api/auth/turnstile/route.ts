// GET /api/auth/turnstile — публічний ключ віджета Turnstile для форми входу; {siteKey: null}, коли перевірка вимкнена.

import { turnstileSiteKey } from "@/lib/server/turnstile";

export const GET = async () => Response.json({ siteKey: turnstileSiteKey() }, { headers: { "cache-control": "no-store" } });
