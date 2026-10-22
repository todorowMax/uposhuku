// Блоки картки спору: угода з етапами, картка сторони, журнал рішень. Без стану, рендеряться на сервері.

import { DECISION_LABEL, type DecisionLogRow, type DisputeParty } from "@/lib/admin/types";
import { feeOf, payoutOf, dealTotal } from "@/lib/deals/machine";
import { formatKop } from "@/lib/deals/price";
import type { Deal, DealStage } from "@/lib/deals/types";
import { formatDay, formatMoney, formatStamp, holdLeft, STAGE_STATE } from "@/lib/admin/format";

const stageTimes = (stage: DealStage): [string, string | undefined][] => [
  ["Оплачено", stage.fundedAt],
  ["Здано", stage.deliveredAt],
  ["Спір", stage.disputedAt],
  ["На доопрацювання", stage.reworkAt],
  ["Виплачено", stage.releasedAt],
  ["Повернено", stage.refundedAt],
];

export function DealSummary({ deal, now }: { deal: Deal; now: number }) {
  const direct = Boolean(deal.conversationId);
  return (
    <div className="grid gap-3">
      {(deal.title || deal.description) && (
        <div className="adm-terms">
          {deal.title && <p className="adm-terms-title">{deal.title}</p>}
          {deal.description && <p className="adm-terms-text">{deal.description}</p>}
          <p className="adm-muted">{direct ? `Умови виставив${deal.proposedBy === "performer" ? " виконавець" : " замовник"} прямо в розмові` : "Угода за відгуком на запит"}</p>
        </div>
      )}
      <ol className="adm-stages">
        {deal.stages.map((stage, index) => {
          const hold = stage.status === "disputed" ? holdLeft(stage.holdUntil, now) : null;
          return (
            <li key={stage.id} className="adm-stage" data-state={stage.status}>
              <div className="adm-stage-head">
                <span className="adm-stage-title">
                  {index + 1}. {stage.title}
                </span>
                <span className="adm-stage-sum">{formatMoney(stage.amount)}</span>
              </div>
              <div className="adm-stage-row">
                <span className="deal-chip" data-tone={stage.status === "released" ? "done" : stage.status === "disputed" ? "todo" : undefined}>
                  {STAGE_STATE[stage.status]}
                </span>
                <span className="adm-muted">{stage.days} дн на етап</span>
                {stage.holdUntil && (
                  <span className="adm-muted">
                    Холд до {formatStamp(stage.holdUntil)}
                    {hold ? `, ${hold.text.toLowerCase()}` : ""}
                  </span>
                )}
              </div>
              <p className="adm-stage-times">
                {stageTimes(stage)
                  .filter(([, at]) => at)
                  .map(([label, at]) => `${label} ${formatStamp(at)}`)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ol>
      <dl className="adm-facts">
        <div>
          <dt>Ціна виконавця</dt>
          <dd>{formatMoney(dealTotal(deal))}</dd>
        </div>
        {deal.method === "safe" && (
          <>
            <div>
              <dt>Винагорода платформи</dt>
              <dd>{formatMoney(deal.stages.reduce((sum, stage) => sum + feeOf(stage.amount, deal.method), 0))}</dd>
            </div>
            <div>
              <dt>Виконавцю</dt>
              <dd>{formatMoney(deal.stages.reduce((sum, stage) => sum + payoutOf(stage.amount), 0))}</dd>
            </div>
            {deal.stages.some((stage) => stage.payment) && (
              <div>
                <dt>Сплатив замовник (з комісією банку)</dt>
                <dd>{formatKop(deal.stages.reduce((sum, stage) => sum + (stage.payment?.total ?? 0), 0))}</dd>
              </div>
            )}
          </>
        )}
        <div>
          <dt>Створено</dt>
          <dd>{formatDay(deal.createdAt)}</dd>
        </div>
        {deal.acceptedAt && (
          <div>
            <dt>Прийнято</dt>
            <dd>{formatDay(deal.acceptedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function PartyCard({ role, party }: { role: string; party: DisputeParty }) {
  return (
    <article className="adm-party">
      <div className="adm-party-head">
        {party.photo ? (
          // Фото профілю лежить у базі як data URL: next/image тут не потрібен.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={party.photo} alt="" className="adm-avatar" />
        ) : (
          <span className="adm-avatar" aria-hidden>
            {initials(party.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="adm-party-role">{role}</p>
          <p className="adm-party-name">{party.name}</p>
        </div>
      </div>
      <dl className="adm-party-facts">
        {party.email && (
          <div>
            <dt>Пошта</dt>
            <dd>{party.email}</dd>
          </div>
        )}
        {party.demo && (
          <div>
            <dt>Акаунт</dt>
            <dd>немає, демо-виконавець</dd>
          </div>
        )}
        {party.specialty && (
          <div>
            <dt>Спеціальність</dt>
            <dd>{party.specialty}</dd>
          </div>
        )}
        {party.city && (
          <div>
            <dt>Місто</dt>
            <dd>{party.city}</dd>
          </div>
        )}
        {party.joinedAt && (
          <div>
            <dt>На платформі з</dt>
            <dd>{formatDay(party.joinedAt)}</dd>
          </div>
        )}
        {party.lastLoginAt && (
          <div>
            <dt>Останній вхід</dt>
            <dd>{formatStamp(party.lastLoginAt)}</dd>
          </div>
        )}
        {!party.demo && (
          <div>
            <dt>Профіль</dt>
            <dd>{party.published ? "опубліковано" : "не опубліковано"}</dd>
          </div>
        )}
      </dl>
      {party.bio && <p className="adm-party-bio">{party.bio.length > 220 ? `${party.bio.slice(0, 219).trimEnd()}…` : party.bio}</p>}
    </article>
  );
}

export function DecisionLog({ log, stages }: { log: DecisionLogRow[]; stages: DealStage[] }) {
  return (
    <ul className="adm-log">
      {log.map((item) => (
        <li key={item.id}>
          <p className="adm-log-head">
            <b>{DECISION_LABEL[item.action]}</b> · етап «{stages.find((stage) => stage.id === item.stageId)?.title ?? "?"}»
          </p>
          <p className="adm-log-text">{item.comment}</p>
          <p className="adm-muted">
            {item.adminEmail}, {formatStamp(item.at)}
          </p>
        </li>
      ))}
    </ul>
  );
}
