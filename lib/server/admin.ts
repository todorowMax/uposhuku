// lib/server/admin.ts
//
// Перевірка адміністратора для сторінок /admin і маршрутів /api/admin: кожен
// маршрут і кожна сторінка питає тут сам, а не покладається на спільний шар.
// Чужому відповідаємо 404, ніби цього шляху немає.

import { headers } from "next/headers";
import type { SessionUser } from "@/lib/auth/types";
import { adminHostAllowed, isAdmin, parseAdminEmails, parseAdminHosts } from "@/lib/admin/access";
import { devCode, getSessionUser } from "./auth";
import { readVar } from "./env";
import { mailMode } from "./mail";

export const adminPolicy = () => ({
  emails: parseAdminEmails(readVar("ADMIN_EMAILS")),
  openLogin: mailMode() === "dev" && !devCode().private,
  allowDevLogin: readVar("ADMIN_DEV_LOGIN") === "1" && readVar("DEPLOY_ENV") !== "production",
});

/** Адреса, за якою прийшов запит: лише з `ADMIN_HOSTS` адмінка існує, на основному домені 404. */
const hostAllowed = async () => adminHostAllowed((await headers()).get("host"), { hosts: parseAdminHosts(readVar("ADMIN_HOSTS")), production: readVar("DEPLOY_ENV") === "production" });

/** Адміністратор або null (чужий хост, гість, не адмін, список порожній). */
export const getAdmin = async (): Promise<SessionUser | null> => {
  if (!(await hostAllowed())) return null;
  const user = await getSessionUser();
  return user && isAdmin(user, adminPolicy()) ? user : null;
};
