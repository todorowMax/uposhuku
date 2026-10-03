// lib/server/db.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/** Drizzle поверх привʼязки D1. Прод без привʼязки DB кидає помилку, а вхід у такому разі вимкнений. */
export const getDb = () => {
  // Тести кладуть сюди D1 з getPlatformProxy (tests/helpers/d1.ts).
  const testBinding = (globalThis as { __TEST_D1?: D1Database }).__TEST_D1;
  const binding = testBinding ?? getCloudflareContext().env.DB;
  if (!binding) throw new Error("Немає привʼязки D1 «DB» у цьому середовищі");
  return drizzle(binding, { schema });
};

export type Db = ReturnType<typeof getDb>;
export { schema };
