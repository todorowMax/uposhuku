// lib/admin/access.ts
//
// Хто може в адмінку. Чиста функція від списку пошт з ADMIN_EMAILS, щоб правило
// перевірялось тестами окремо від сесій і бази.

export const parseAdminEmails = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export interface AdminPolicy {
  /** Пошти зі змінної ADMIN_EMAILS. */
  emails: string[];
  /** Вхід листом відкритий: будь-яка пошта з кодом 000000 (dev-воркер, локально). */
  openLogin: boolean;
  /** Явний дозвіл пускати і після такого входу: лише локально, у .dev.vars. */
  allowDevLogin: boolean;
}

/**
 * Пошта в списку, і вхід не підроблюється: де код входу всім відомий (000000), адмінів
 * пускаємо лише через Google або з явним ADMIN_DEV_LOGIN, інакше на dev-воркері
 * будь-хто увійшов би «як адмін», просто ввівши його пошту.
 */
export const isAdmin = (user: { email: string; via: "email" | "google" }, policy: AdminPolicy): boolean => {
  if (!policy.emails.includes(user.email.trim().toLowerCase())) return false;
  if (user.via === "email" && policy.openLogin && !policy.allowDevLogin) return false;
  return true;
};

/** Хост без порту й регістру: `Admin.Example.com:443` → `admin.example.com`. */
const bareHost = (host: string) => host.trim().toLowerCase().replace(/:\d+$/, "");

export const parseAdminHosts = (raw: string | undefined): string[] => parseAdminEmails(raw).map(bareHost);

/**
 * З якого хоста адмінку взагалі видно. Задано `ADMIN_HOSTS`: лише з цих адрес, на решті 404, тож
 * на основному домені її немає. Не задано: на проді вимкнена зовсім, поза продом (локально, dev) без обмеження.
 */
export const adminHostAllowed = (host: string | null | undefined, policy: { hosts: string[]; production: boolean }): boolean => {
  if (policy.hosts.length === 0) return !policy.production;
  return Boolean(host) && policy.hosts.includes(bareHost(host as string));
};
