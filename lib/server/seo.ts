// lib/server/seo.ts
//
// Індексація для серверних сторінок: читаємо змінні воркера й передаємо чистому lib/seo/indexing.ts.

import { indexingOpen, robotsMeta } from "@/lib/seo/indexing";
import { readVar } from "./env";

const env = () => ({
  DEPLOY_ENV: readVar("DEPLOY_ENV"),
  SEO_INDEXING: readVar("SEO_INDEXING"),
});

export const indexingEnabled = (): boolean => indexingOpen(env());

export const siteRobots = () => robotsMeta(env());
