"use client";

// «Роботи»: конкретні проєкти, теги з яких підтверджують навички.

import { Plus } from "@/components/icons";
import { WorkEditor } from "@/components/profile/work-editor";
import { Button } from "@/components/ui/button";
import { PROFILE_LIMITS, type ProfileWork } from "@/lib/profile/types";

export namespace ProfileWorksSectionTypes {
  export type Props = {
    works: ProfileWork[];
    onChange: (id: string, patch: Partial<ProfileWork>) => void;
    onRemove: (id: string) => void;
    onAdd: () => void;
  };
}

export const ProfileWorksSection = ({ works, onChange, onRemove, onAdd }: ProfileWorksSectionTypes.Props) => (
  <section className="pe-section" aria-labelledby="pe-works">
    <div className="flex items-end justify-between gap-3">
      <h2 id="pe-works" className="pe-title">
        Роботи
      </h2>
      <span className="text-xs text-ink-muted">
        {works.length}/{PROFILE_LIMITS.works}
      </span>
    </div>
    <p className="pe-hint -mt-1">
      Окремо від «Про себе»: тут конкретні проєкти. Розкажіть про кожен, і його теги підтвердять ваші навички. Додайте хоча б одну роботу: профілі з роботами довіряють більше.
    </p>
    {works.map((work, index) => (
      <WorkEditor key={work.id} work={work} index={index} onChange={(patch) => onChange(work.id, patch)} onRemove={() => onRemove(work.id)} />
    ))}
    {works.length < PROFILE_LIMITS.works && (
      <Button variant="bare" onClick={onAdd} className="pe-add">
        <Plus className="size-4" />
        {works.length ? "Ще одна робота" : "Додати роботу"}
      </Button>
    )}
  </section>
);
