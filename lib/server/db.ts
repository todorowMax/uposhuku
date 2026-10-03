// lib/server/db.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/** Drizzle поверх привʼязки D1. Прод без привʼязки DB кидає помилку, а вхід у такому разі вимкнений. */
export const getDb = () => {
  const { env } = getCloudflareContext();
  if (!env.DB) throw new Error("Немає привʼязки D1 «DB» у цьому середовищі");
  return drizzle(env.DB, { schema });
};

export type Db = ReturnType<typeof getDb>;
export { schema };
