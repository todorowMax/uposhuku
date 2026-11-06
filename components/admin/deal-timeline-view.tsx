// Хронологія угоди в картці спору й скарги. Без стану, рендериться на сервері.

import type { DealTimeline } from "@/lib/admin/deal-timeline";
import { EXTERNAL_LINK_REL } from "@/lib/deals/dispute-aids";
import { formatStamp } from "@/lib/admin/format";

export const DealTimelineView = ({ timeline }: { timeline: DealTimeline }) => (
  <div className="grid gap-3">
    <dl className="adm-facts">
      {timeline.notes.map((note) => (
        <div key={note.label}>
          <dt>{note.label}</dt>
          <dd className="adm-log-text">{note.value}</dd>
        </div>
      ))}
    </dl>
    <ol className="adm-log">
      {timeline.events.map((event, index) => (
        <li key={`${event.at}-${index}`}>
          <p className="adm-log-head">
            <b>{event.label}</b> · <span className="adm-muted">{formatStamp(event.at)}</span>
          </p>
          {event.detail && <p className="adm-log-text">{event.detail}</p>}
          {event.href && (
            <a href={event.href} className="adm-log-link" {...(event.external ? { target: "_blank", rel: EXTERNAL_LINK_REL } : { target: "_blank", rel: "noopener" })}>
              {event.external ? "Відкрити за посиланням" : "Відкрити файл"}
            </a>
          )}
        </li>
      ))}
    </ol>
  </div>
);
