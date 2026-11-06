// /admin/complaints/:id: скарга на пряму угоду. Сама скарга, хронологія угоди, переписка й закриття з коментарем.
// Гроші й статус етапу тут не змінюються: прямий переказ іде повз нас.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatLog } from "@/components/admin/chat-log";
import { ComplaintBody, ComplaintCloseForm } from "@/components/admin/complaint-blocks";
import { DealTimelineView } from "@/components/admin/deal-timeline-view";
import { DealSummary, PartyCard } from "@/components/admin/dispute-blocks";
import { ArrowLeft } from "@/components/icons";
import { DEAL_STATE, METHOD_LABEL } from "@/lib/admin/format";
import { COMPLAINT_NOTE } from "@/lib/deals/complaints";
import { getAdmin } from "@/lib/server/admin";
import { complaintView, getDisputeCard } from "@/lib/server/admin-repo";
import { getComplaint } from "@/lib/server/complaint-repo";

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) notFound();
  const stored = await getComplaint((await params).id);
  const card = stored ? await getDisputeCard(stored.dealId) : null;
  if (!stored || !card) notFound();
  const { deal } = card;
  const complaint = complaintView(stored, deal);
  return (
    <>
      <Link href="/admin?tab=complaints" className="legal-back">
        <ArrowLeft className="size-4" /> Усі скарги
      </Link>
      <header className="adm-head">
        <h1 className="adm-title">Скарга: {card.title}</h1>
        <div className="adm-chips">
          <span className="adm-num">{deal.number}</span>
          <span className="deal-chip">{METHOD_LABEL[deal.method]}</span>
          <span className="deal-chip">{DEAL_STATE[deal.status]}</span>
          <span className="deal-chip" data-tone={complaint.status === "open" ? "todo" : "done"}>
            {complaint.status === "open" ? "Відкрита" : "Закрита"}
          </span>
        </div>
      </header>
      <div className="grid gap-3.5">
        <section className="adm-card" aria-labelledby="adm-complaint">
          <h2 id="adm-complaint" className="adm-h2">
            Скарга
          </h2>
          <ComplaintBody complaint={complaint} />
          <p className="adm-muted mt-2">{COMPLAINT_NOTE}</p>
          <div className="mt-4">
            <DealSummary deal={deal} now={Date.parse(complaint.createdAt)} />
          </div>
        </section>
        <section className="adm-card" aria-labelledby="adm-timeline">
          <h2 id="adm-timeline" className="adm-h2">
            Хронологія
          </h2>
          <DealTimelineView timeline={card.timeline} />
        </section>
        <section className="adm-card" aria-labelledby="adm-parties">
          <h2 id="adm-parties" className="adm-h2">
            Сторони
          </h2>
          <div className="adm-parties">
            <PartyCard label="Замовник" party={card.customer} />
            <PartyCard label="Виконавець" party={card.performer} />
          </div>
        </section>
        <section className="adm-card" aria-labelledby="adm-chat">
          <h2 id="adm-chat" className="adm-h2">
            Переписка
          </h2>
          <ChatLog dealId={deal.id} messages={card.messages} customer={card.customer.name} performer={card.performer.name} hasConversation={Boolean(card.conversationId)} />
        </section>
        <section id="decision" className="adm-card" aria-labelledby="adm-close">
          <h2 id="adm-close" className="adm-h2">
            Закриття
          </h2>
          {complaint.status === "open" ? <ComplaintCloseForm complaintId={complaint.id} /> : <p className="adm-muted">Скаргу закрито.</p>}
        </section>
      </div>
    </>
  );
}
