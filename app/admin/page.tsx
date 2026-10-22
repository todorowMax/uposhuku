// /admin: черга спорів по угодах. Відкриті зверху свіжими, нижче вкладка розглянутих.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DECISION_LABEL, type DisputeRow } from "@/lib/admin/types";
import { formatMoney, formatStamp, holdLeft, METHOD_LABEL, openFor } from "@/lib/admin/format";
import { getAdmin } from "@/lib/server/admin";
import { listDisputes } from "@/lib/server/admin-repo";

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await getAdmin())) notFound();
  const tab = (await searchParams).tab === "resolved" ? "resolved" : "open";
  const { open, resolved } = await listDisputes();
  const rows = tab === "open" ? open : resolved;
  const now = Date.now();
  return (
    <>
      <h1 className="adm-title">Спори</h1>
      <nav className="adm-tabs" aria-label="Спори">
        <Link href="/admin" data-active={tab === "open" || undefined} aria-current={tab === "open" ? "page" : undefined}>
          Відкриті <b>{open.length}</b>
        </Link>
        <Link href="/admin?tab=resolved" data-active={tab === "resolved" || undefined} aria-current={tab === "resolved" ? "page" : undefined}>
          Розглянуті <b>{resolved.length}</b>
        </Link>
      </nav>
      {rows.length === 0 ? (
        <p className="adm-empty">{tab === "open" ? "Відкритих спорів немає." : "Розглянутих спорів ще немає."}</p>
      ) : (
        <ul className="adm-list">
          {rows.map((row) => (
            <DisputeItem key={row.dealId} row={row} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}

function DisputeItem({ row, now }: { row: DisputeRow; now: number }) {
  const hold = holdLeft(row.holdUntil, now);
  return (
    <li>
      <Link href={`/admin/disputes/${row.dealId}`} className="adm-item">
        <div className="adm-item-head">
          <span className="adm-item-title">{row.title}</span>
          <span className="adm-item-sum">{formatMoney(row.stageAmount)}</span>
        </div>
        <p className="adm-item-meta">
          <span className="adm-num">{row.number}</span> · Етап «{row.stageTitle}» з {formatMoney(row.total)} · {METHOD_LABEL[row.method]}
        </p>
        <p className="adm-item-meta">
          {row.customerName} <span aria-hidden>→</span> {row.performerName}
        </p>
        <div className="adm-item-foot">
          {row.decision ? (
            <>
              <span className="deal-chip" data-tone="done">
                {DECISION_LABEL[row.decision.action]}
              </span>
              <span className="adm-item-when">Вирішено {formatStamp(row.decision.at)}</span>
            </>
          ) : (
            <>
              <span className="deal-chip" data-tone="todo">
                Відкрито {openFor(row.openedAt, now)}
              </span>
              {hold && (
                <span className="deal-chip" data-tone={hold.tone === "late" ? "late" : hold.tone === "soon" ? "todo" : undefined}>
                  {hold.text}
                </span>
              )}
              <span className="adm-item-when">з {formatStamp(row.openedAt)}</span>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}
