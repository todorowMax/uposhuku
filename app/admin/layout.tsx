// Адмінка: оболонка. Сторінки під /admin бачать лише адміністратори (ADMIN_EMAILS);
// всім іншим 404, ніби шляху немає. Кожна сторінка перевіряє доступ ще й сама.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/server/admin";

export const metadata: Metadata = {
  title: "Модерація · Findlyfy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  return (
    <div className="adm-page">
      <header className="adm-bar">
        <Link href="/admin" className="adm-brand">
          Findlyfy <span>Модерація</span>
        </Link>
        <div className="adm-bar-side">
          <span className="adm-who" title={admin.email}>
            {admin.email}
          </span>
          <Link href="/" className="adm-bar-link">
            На карту
          </Link>
        </div>
      </header>
      <main className="adm-main">{children}</main>
    </div>
  );
}
