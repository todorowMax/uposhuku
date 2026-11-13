// /admin/deletions: журнал видалень акаунтів. Лише номер і час, без пошти й імені (рядок користувача лишається «могилою»).

import { notFound } from "next/navigation";
import { formatStamp } from "@/lib/admin/format";
import { getAdmin } from "@/lib/server/admin";
import { listDeletions } from "@/lib/server/account-retention";

export default async function AdminDeletionsPage() {
  if (!(await getAdmin())) notFound();
  const { total, items } = await listDeletions();
  return (
    <>
      <h1 className="adm-title">Видалення акаунтів</h1>
      <p className="adm-item-meta">Усього видалено: {total}</p>
      {items.length === 0 ? (
        <p className="adm-empty">Видалених акаунтів ще немає.</p>
      ) : (
        <ul className="adm-list">
          {items.map((item) => (
            <li key={item.id} className="adm-item">
              <div className="adm-item-head">
                <span className="adm-item-title adm-num">{item.id}</span>
                <span className="adm-item-when">{formatStamp(new Date(item.deletedAt).toISOString())}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
