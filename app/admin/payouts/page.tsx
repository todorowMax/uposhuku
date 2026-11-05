// /admin/payouts: заявки виконавців на виплати безпечної угоди. Кнопка «Перевірити в банку» звіряє ІПН зі списком
// отримувачів розщеплення й вмикає виплати; «Відхилити» і «Відключити» ставлять `rejected` з причиною. Самого ІПН на екрані немає, лише маска.

import { notFound } from "next/navigation";
import { PayoutRejectForm } from "@/components/admin/payout-reject-form";
import { PayoutVerifyButton } from "@/components/admin/payout-verify-button";
import { getAdmin } from "@/lib/server/admin";
import { listPayoutApplications } from "@/lib/server/payout-repo";

const STATUS = { pending: "Чекає перевірки", active: "Підключено", rejected: "Відхилено" } as const;
const WHEN = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" });

export default async function AdminPayoutsPage() {
  if (!(await getAdmin())) notFound();
  const applications = await listPayoutApplications();
  return (
    <>
      <h1 className="adm-title">Виплати виконавців</h1>
      {applications.length === 0 ? (
        <p className="adm-empty">Заявок ще немає.</p>
      ) : (
        <ul className="adm-list">
          {applications.map((item) => (
            <li key={item.userId} className="adm-item">
              <div className="adm-item-head">
                <span className="adm-item-title">{item.fopName}</span>
                <span className="deal-chip" data-tone={item.status === "active" ? "done" : "todo"}>
                  {STATUS[item.status]}
                </span>
              </div>
              <p className="adm-item-meta">
                {item.email} · ІПН {item.taxIdMask}
              </p>
              <p className="adm-item-meta">
                Подано {WHEN.format(item.createdAt)}
                {item.checkedAt ? `, остання перевірка ${WHEN.format(item.checkedAt)}` : ""}
              </p>
              {item.status === "rejected" && item.rejectReason && <p className="adm-item-meta">Причина: {item.rejectReason}</p>}
              {item.status !== "active" && <PayoutVerifyButton userId={item.userId} />}
              {item.status !== "rejected" && <PayoutRejectForm userId={item.userId} active={item.status === "active"} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
