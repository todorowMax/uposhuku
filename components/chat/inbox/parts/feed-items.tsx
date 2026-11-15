"use client";

// components/chat/inbox/parts/feed-items.tsx
//
// Блоки стрічки: розділювач дня, подія угоди (з чипом номера), група подій однієї угоди, рішення модератора, таблетка
// для коротких службових рядків. Що показувати, вирішує lib/chat/feed.ts.

import { useState } from "react";
import { ChevronDown, FileText, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatLine } from "@/lib/chat/client";
import { clockTime } from "@/lib/chat/dates";
import type { ModeratorDecision } from "@/lib/chat/feed";

export const DayDivider = ({ label }: { label: string }) => (
  <p className="dm-day">
    <span>{label}</span>
  </p>
);

export const Pill = ({ line }: { line: ChatLine }) => (
  <p className="dm-system">
    {line.text}
    <time dateTime={line.at}>{clockTime(line.at)}</time>
  </p>
);

/** Чип з номером: відкриває екран угоди; якщо угоди вже немає серед живих, лишається написом. */
const DealChip = ({ number, onOpen }: { number: string; onOpen?: () => void }) =>
  onOpen ? (
    <Button variant="bare" className="dm-chip" onClick={onOpen} aria-label={`Відкрити угоду ${number}`}>
      {number}
    </Button>
  ) : (
    <span className="dm-chip" data-static>
      {number}
    </span>
  );

const DealEvent = ({ line, number, onOpen }: { line: ChatLine; number: string; onOpen?: () => void }) => (
  <div className="dm-event">
    <FileText aria-hidden className="size-4 shrink-0" strokeWidth={2} />
    <p>{line.text.replace(number, "").replace(/\s{2,}/g, " ").trim()}</p>
    <DealChip number={number} onOpen={onOpen} />
    <time dateTime={line.at}>{clockTime(line.at)}</time>
  </div>
);

export const DealEvents = ({ number, lines, onOpen }: { number: string; lines: ChatLine[]; onOpen?: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const last = lines[lines.length - 1];
  if (lines.length === 1) return <DealEvent line={last} number={number} onOpen={onOpen} />;
  return (
    <div className="dm-events">
      <Button variant="bare" className="dm-events-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <ChevronDown aria-hidden className="size-3.5" strokeWidth={2.2} data-open={expanded || undefined} />
        {expanded ? `Сховати події за угодою ${number}` : `${lines.length} подій за угодою ${number}`}
      </Button>
      {(expanded ? lines : [last]).map((line) => (
        <DealEvent key={line.id} line={line} number={number} onOpen={onOpen} />
      ))}
    </div>
  );
};

export const ModeratorCard = ({ line, decision, onOpen }: { line: ChatLine; decision: ModeratorDecision; onOpen?: () => void }) => (
  <section className="dm-decision" aria-label="Рішення модератора">
    <h3>
      <Scale aria-hidden className="size-4" strokeWidth={2} />
      Рішення модератора
      {decision.number && <DealChip number={decision.number} onOpen={onOpen} />}
    </h3>
    <p>{decision.outcome}</p>
    {decision.comment && <p className="dm-decision-comment">{decision.comment}</p>}
    <time dateTime={line.at}>{clockTime(line.at)}</time>
  </section>
);
