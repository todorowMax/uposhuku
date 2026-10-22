// /admin/disputes/:dealId: картка спору. Угода, сторони, вся переписка пари й рішення.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatLog } from "@/components/admin/chat-log";
import { DecisionForm } from "@/components/admin/decision-form";
import { DealSummary, DecisionLog, PartyCard } from "@/components/admin/dispute-blocks";
import { ArrowLeft } from "@/components/icons";
import { DEAL_STATE, formatStamp, holdLeft, METHOD_LABEL, openFor } from "@/lib/admin/format";
import { getAdmin } from "@/lib/server/admin";
import { getDisputeCard } from "@/lib/server/admin-repo";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) notFound();
  const card = await getDisputeCard((await params).id);
  if (!card) notFound();
  const { deal } = card;
  const now = Date.now();
  const openStage = deal.stages.find((stage) => stage.id === card.openStageId);
  const hold = openStage ? holdLeft(openStage.holdUntil, now) : null;
  return (
    <>
      <Link href="/admin" className="legal-back">
        <ArrowLeft className="size-4" /> Усі спори
      </Link>
      <header className="adm-head">
        <h1 className="adm-title">{card.title}</h1>
        <div className="adm-chips">
          <span className="adm-num">{deal.number}</span>
          <span className="deal-chip">{METHOD_LABEL[deal.method]}</span>
          <span className="deal-chip">{DEAL_STATE[deal.status]}</span>
          {openStage ? (
            <>
              <span className="deal-chip" data-tone="todo">
                Спір з {formatStamp(openStage.disputedAt)}, {openFor(openStage.disputedAt ?? deal.createdAt, now)}
              </span>
              {hold && (
                <span className="deal-chip" data-tone={hold.tone === "late" ? "late" : hold.tone === "soon" ? "todo" : undefined}>
                  {hold.text}
                </span>
              )}
            </>
          ) : (
            <span className="deal-chip" data-tone="done">
              Спір розглянуто
            </span>
          )}
        </div>
        {openStage && (
          <a href="#decision" className="adm-jump">
            До рішення
          </a>
        )}
      </header>
      <div className="adm-grid">
        <section className="adm-card" style={{ gridArea: "deal" }} aria-labelledby="adm-deal">
          <h2 id="adm-deal" className="adm-h2">
            Угода
          </h2>
          <DealSummary deal={deal} now={now} />
        </section>
        <section className="adm-card" style={{ gridArea: "parties" }} aria-labelledby="adm-parties">
          <h2 id="adm-parties" className="adm-h2">
            Сторони
          </h2>
          <div className="adm-parties">
            <PartyCard role="Замовник" party={card.customer} />
            <PartyCard role="Виконавець" party={card.performer} />
          </div>
        </section>
        <section className="adm-card adm-chat" style={{ gridArea: "chat" }} aria-labelledby="adm-chat">
          <h2 id="adm-chat" className="adm-h2">
            Переписка
          </h2>
          <ChatLog dealId={deal.id} messages={card.messages} customer={card.customer.name} performer={card.performer.name} hasConversation={Boolean(card.conversationId)} />
        </section>
        <section id="decision" className="adm-card" style={{ gridArea: "decision" }} aria-labelledby="adm-decision">
          <h2 id="adm-decision" className="adm-h2">
            Рішення
          </h2>
          {openStage ? (
            <DecisionForm dealId={deal.id} stageId={openStage.id} stageTitle={openStage.title} amount={openStage.amount} method={deal.method} holdLate={hold?.tone === "late"} reworkable={hold?.tone !== "late"} />
          ) : (
            <p className="adm-muted">Спору на етапах немає. Ухвалені рішення дивіться в журналі нижче.</p>
          )}
        </section>
        {card.log.length > 0 && (
          <section className="adm-card" style={{ gridArea: "log" }} aria-labelledby="adm-log">
            <h2 id="adm-log" className="adm-h2">
              Журнал рішень
            </h2>
            <DecisionLog log={card.log} stages={deal.stages} />
          </section>
        )}
      </div>
    </>
  );
}
