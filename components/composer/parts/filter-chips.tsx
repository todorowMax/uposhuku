"use client";

// Чипи фільтрів: групи спеціалістів, вибрані теги, фільтри запитів. Стоять у стрічці під полем запиту й у панелі «Фільтри».

import { Plus, X } from "@/components/icons";
import { pickTag, toggleGroup, toggleTag } from "@/components/composer/use-specialist-filters";
import { TagPicker } from "@/components/tags/tag-picker";
import { Button, type ButtonTypes } from "@/components/ui/button";
import { applyRequestFilter, mapRequestsStore, requestFilterStore, type RequestFilter } from "@/lib/feed/map-requests";
import { clearFilter, filterTags, groupFilter, useStore } from "@/lib/map/filters";
import type { SpecialistFiltersState } from "@/components/composer/use-specialist-filters";
import { feedCollapsedStore } from "@/lib/requests/side-panel";
import { tagLabel } from "@/lib/tags/engine";

export namespace FilterChipsTypes {
  export type GroupProps = Pick<SpecialistFiltersState, "pool" | "groups" | "selectedGroups">;
}

/** «Усі» і групи спеціалістів з лічильником. */
export const GroupChips = ({ pool, groups, selectedGroups }: FilterChipsTypes.GroupProps) => (
  <>
    <Button variant="bare" aria-pressed={selectedGroups.length === 0} onClick={() => clearFilter(groupFilter)} className="filter-chip">
      Усі
      <span className="filter-chip-count">{pool.length}</span>
    </Button>
    {groups.map((item) => (
      <Button key={item.id} variant="bare" aria-pressed={selectedGroups.includes(item.id)} onClick={() => toggleGroup(item.id)} className="filter-chip">
        {item.label}
        <span className="filter-chip-count">{item.count}</span>
      </Button>
    ))}
  </>
);

/** Теги, вибрані пошуком у «Фільтрах»: чип з хрестиком, клік прибирає тег із фільтра. */
export const PickedTagChips = () => {
  const tags = useStore(filterTags);
  return (
    <>
      {tags.map((id) => (
        <Button key={id} variant="bare" aria-pressed onClick={() => toggleTag(id)} className="filter-chip" title="Прибрати з фільтра">
          {tagLabel(id)}
          <X aria-hidden className="size-3" />
        </Button>
      ))}
    </>
  );
};

/** Чип «+ Тег», що відкриває вибір тегу для фільтра. Приймає пропси кнопки: його використовують як `asChild`-тригер. */
export const AddTagChip = (props: ButtonTypes.Props) => (
  <Button variant="bare" className="filter-chip" aria-label="Додати тег у фільтр" {...props}>
    <Plus aria-hidden className="size-3.5" />
    Тег
  </Button>
);

/** Фільтри запитів: чипи замість груп спеціалістів. */
export const RequestChips = () => {
  const { items, performer } = useStore(mapRequestsStore);
  const filter = useStore(requestFilterStore);
  const pickedTags = useStore(filterTags);
  // Рахуємо чужі запити, як і список «Запити для вас»: свої там не показуємо.
  const others = items.filter((item) => !item.own);
  const remote = others.filter((item) => item.remote).length;

  const chip = (id: RequestFilter, label: string) => (
    <Button key={id} variant="bare" aria-pressed={filter === id} onClick={() => requestFilterStore.set(id)} className="filter-chip">
      {label}
      <span className="filter-chip-count">{applyRequestFilter(others, id, pickedTags).length}</span>
    </Button>
  );

  return (
    <>
      {chip("all", "Усі")}
      {performer && chip("matched", "Під мої теги")}
      {chip("urgent", "Терміново")}
      {chip("budget", "З бюджетом")}
      {performer && remote > 0 && (
        <Button
          variant="bare"
          aria-pressed={filter === "remote"}
          onClick={() => {
            requestFilterStore.set(filter === "remote" ? "all" : "remote");
            feedCollapsedStore.set(false);
          }}
          className="filter-chip"
          title="Запити без міста: на карті вони стоять у центрі України з підписом «Віддалено»"
        >
          Віддалено
          <span className="filter-chip-count">{remote}</span>
        </Button>
      )}
      <PickedTagChips />
      <TagPicker
        context="filter"
        title="Теги запитів"
        selected={pickedTags}
        labelOf={tagLabel}
        onToggle={pickTag}
        trigger={<AddTagChip />}
      />
    </>
  );
};

