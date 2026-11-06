// Черга відкритих скарг на прямі угоди. Без стану, рендериться на сервері.

import Link from "next/link";
import { formatStamp } from "@/lib/admin/format";
import type { ComplaintView } from "@/lib/admin/types";
import { COMPLAINT_REASON_LABEL } from "@/lib/deals/complaints";

const SIDE = { customer: "Замовник", performer: "Виконавець" } as const;

export const ComplaintList = ({ items }: { items: { complaint: ComplaintView; number: string }[] }) =>
  items.length === 0 ? (
    <p className="adm-empty">Відкритих скарг немає.</p>
  ) : (
    <ul className="adm-list">
      {items.map(({ complaint, number }) => (
        <li key={complaint.id}>
          <Link href={`/admin/complaints/${complaint.id}`} className="adm-item">
            <div className="adm-item-head">
              <span className="adm-item-title">{COMPLAINT_REASON_LABEL[complaint.reason]}</span>
            </div>
            <p className="adm-item-meta">
              <span className="adm-num">{number}</span> · Етап «{complaint.stageTitle}» · скаржиться {SIDE[complaint.side].toLowerCase()}
            </p>
            <div className="adm-item-foot">
              <span className="deal-chip" data-tone="todo">
                Відкрито
              </span>
              <span className="adm-item-when">з {formatStamp(complaint.createdAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
