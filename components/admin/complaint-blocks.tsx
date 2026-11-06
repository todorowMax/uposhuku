"use client";

// Скарги в адмінці: короткий вигляд скарги й форма закриття з коментарем.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { DECISION_COMMENT_MAX, type ComplaintView } from "@/lib/admin/types";
import { formatStamp } from "@/lib/admin/format";
import { COMPLAINT_REASON_LABEL } from "@/lib/deals/complaints";
import { useComplaintClose } from "./use-complaint-close";

const SIDE = { customer: "Замовник", performer: "Виконавець" } as const;

export const ComplaintBody = ({ complaint }: { complaint: ComplaintView }) => (
  <div className="grid gap-1">
    <p className="adm-log-head">
      <b>{SIDE[complaint.side]}</b> · етап «{complaint.stageTitle}» · {formatStamp(complaint.createdAt)}
    </p>
    <p className="adm-log-head">Причина: {COMPLAINT_REASON_LABEL[complaint.reason]}</p>
    <p className="adm-log-text">{complaint.text}</p>
    {complaint.status === "closed" && (
      <p className="adm-muted">
        Закрито {formatStamp(complaint.closedAt)}, {complaint.closedByEmail}: {complaint.closeComment}
      </p>
    )}
  </div>
);

export const ComplaintCloseForm = ({ complaintId }: { complaintId: string }) => {
  const form = useComplaintClose(complaintId);
  return (
    <div className="grid gap-2">
      <Field label="Коментар до закриття" htmlFor={`close-${complaintId}`} hint="Гроші й статус етапу не змінюються. Коментар лишається в записі скарги.">
        <Textarea id={`close-${complaintId}`} value={form.comment} maxLength={DECISION_COMMENT_MAX} onChange={(event) => form.setComment(event.target.value)} />
      </Field>
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <Button disabled={form.busy} onClick={() => void form.submit()} className="w-auto px-4">
        {form.busy && <Loader2 className="size-4 animate-spin" />}
        Закрити скаргу
      </Button>
    </div>
  );
};
