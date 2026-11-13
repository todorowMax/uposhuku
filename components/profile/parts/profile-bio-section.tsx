"use client";

// «Про себе і чим займаєтесь»: вільний текст, з якого розбираються теги, і самі теги.

import { TagChips } from "@/components/profile/tag-chips";
import { TaggedField } from "@/components/profile/tagged-field";
import { TagPicker } from "@/components/tags/tag-picker";
import { PROFILE_LIMITS } from "@/lib/profile/types";
import type { ProfileEditor } from "@/components/profile/use-profile-editor";

export namespace ProfileBioSectionTypes {
  export type Props = Pick<ProfileEditor, "bio" | "bioMentions" | "tagging" | "proposals" | "proven"> & {
    onBioChange: (value: string) => void;
  };
}

export const ProfileBioSection = ({ bio, bioMentions, tagging, proposals, proven, onBioChange }: ProfileBioSectionTypes.Props) => (
  <section className="pe-section" aria-labelledby="pe-about-me">
    <h2 id="pe-about-me" className="pe-title">
      Про себе і чим займаєтесь
    </h2>
    <p className="pe-hint -mt-1">Пишіть як людині: що робите, для кого, чим. Ми самі виберемо теги, за якими вас знайдуть, а слова, з яких вони взяті, підкреслимо.</p>
    <div className="pe-textbox">
      <TaggedField
        id="pe-bio"
        value={bio}
        onChange={onBioChange}
        mentions={bioMentions}
        maxLength={PROFILE_LIMITS.bio}
        minRows={5}
        describedBy="pe-bio-count"
        placeholder="Роблю Telegram-боти й автоматизації для малого бізнесу: салони, клініки, доставка. Працюю з n8n і Python, підключаю Monobank та Нова Пошта. Можу взяти проєкт від ТЗ до запуску."
      />
    </div>
    <p id="pe-bio-count" className="pe-counter">
      {bio.length}/{PROFILE_LIMITS.bio}
    </p>

    <h3 className="pe-label mt-1">Ваші теги</h3>
    <TagChips
      tags={tagging.tags}
      suggestions={tagging.suggestions}
      proven={proven}
      labelOf={tagging.labelOf}
      onRemove={tagging.remove}
      onAdd={tagging.add}
      emptyHint="Розкажіть про себе вище, і теги з'являться тут самі. Або додайте їх вручну."
      pending={proposals.items}
      onRemovePending={(id) => {
        const item = proposals.items.find((proposal) => proposal.id === id);
        if (item) void proposals.remove(item);
      }}
    >
      <TagPicker
        context="profile"
        selected={tagging.tags}
        auto={tagging.auto}
        suggestions={tagging.suggestions}
        labelOf={tagging.labelOf}
        onToggle={tagging.toggle}
        onPropose={proposals.propose}
        limitReached={tagging.manualFull}
        limitHint={`Вручну можна додати до ${PROFILE_LIMITS.manualTags} тегів. Теги з тексту в цей ліміт не входять.`}
      />
    </TagChips>
    <p className="pe-hint">Галочка стоїть біля тегів, які підтверджує ваша робота. З такими тегами вас покажуть вище.</p>
  </section>
);
