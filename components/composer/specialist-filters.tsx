"use client";

// components/composer/specialist-filters.tsx
//
// Фільтри під полем запиту, завширшки як саме поле. Спершу «Усі», далі групи спеціалістів з лічильником, найбільша
// перша; групи й числа з тих, хто на карті з урахуванням тегів запиту, міста й «онлайн». Чип вмикається й вимикається
// натисканням, вибрати можна кілька; «Усі» знімає вибір. Стрічка гортається вбік, а «Фільтри» праворуч стоять на місці
// й відкривають панель з усім: групи, теги, міста, онлайн. Панель на телефоні шторка, від 768 px поповер біля кнопки
// (DESIGN.md, «Шари»). Стан у `use-specialist-filters.ts` і `use-filter-panel.ts`, чипи й панель у `parts/`.

import { useState } from "react";
import { ListChecks, SlidersHorizontal } from "@/components/icons";
import { AddTagChip, GroupChips, PickedTagChips, RequestChips } from "@/components/composer/parts/filter-chips";
import { FilterPanelBody, FilterPanelFooter } from "@/components/composer/parts/filter-panel";
import { pickTag, useSpecialistFilters } from "@/components/composer/use-specialist-filters";
import { useFilterPanel } from "@/components/composer/use-filter-panel";
import { TagPicker } from "@/components/tags/tag-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { filterTags, useStore } from "@/lib/map/filters";
import { tagLabel } from "@/lib/tags/engine";
import { openAfterLayers } from "@/lib/ui/use-layer-history";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace SpecialistFiltersTypes {
  export type Props = {
    expanded: boolean;
    /** Поки пишеш новий запит: кнопка ліворуч, щоб повернутися до своїх. */
    myRequests: { count: number; onOpen: () => void } | null;
  };
}

const FilterPanel = ({ state, desktop, onClose, onPickTags }: { state: ReturnType<typeof useSpecialistFilters>; desktop: boolean; onClose: () => void; onPickTags: () => void }) => {
  const { pool, groups, selectedGroups, allPerformers, shown } = state;
  const panel = useFilterPanel(pool, allPerformers);
  // На телефоні шторка не відкриває шторку: вибір тегів іде після закриття панелі (див. SpecialistFilters).
  const tagControl = desktop ? <TagPicker context="filter" title="Теги спеціалістів" selected={panel.pickedTags} labelOf={tagLabel} onToggle={pickTag} trigger={<AddTagChip />} /> : <AddTagChip onClick={onPickTags} />;
  const body = <FilterPanelBody pool={pool} groups={groups} selectedGroups={selectedGroups} allPerformers={allPerformers} tagControl={tagControl} panel={panel} />;
  const footer = <FilterPanelFooter shown={shown} onReset={panel.reset} onClose={onClose} />;
  if (desktop) {
    return (
      <>
        <div className="filter-panel-scroll">{body}</div>
        <div className="px-4 pb-4">{footer}</div>
      </>
    );
  }
  return (
    <>
      <SheetBody className="filter-panel grid gap-4">{body}</SheetBody>
      <div className="px-4 pb-4">{footer}</div>
    </>
  );
};

export const SpecialistFilters = ({ expanded, myRequests }: SpecialistFiltersTypes.Props) => {
  const state = useSpecialistFilters();
  const { mode, active, pool, groups, selectedGroups } = state;
  const desktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const pickedTags = useStore(filterTags);
  const trigger = (
    <Button variant="bare" className="filter-chip filter-all filter-action" data-active={active > 0}>
      <SlidersHorizontal aria-hidden className="size-4" />
      Фільтри
      {active > 0 && <span className="filter-all-badge">{active}</span>}
    </Button>
  );
  const close = () => setOpen(false);
  const pickTags = () => {
    close();
    openAfterLayers(() => setTagsOpen(true));
  };

  return (
    <div className="filter-bar" data-expanded={expanded}>
      {myRequests && (
        <Button variant="bare" onClick={myRequests.onOpen} className="filter-chip filter-all">
          <ListChecks aria-hidden className="size-4" />
          Мої запити
          <span className="filter-all-badge">{myRequests.count}</span>
        </Button>
      )}
      <div
        className="filter-strip"
        role="toolbar"
        aria-label={mode === "requests" ? "Фільтри запитів" : "Групи спеціалістів"}
        // Згасання зліва лише тоді, коли стрічку вже прогорнули.
        onScroll={(event) => {
          event.currentTarget.dataset.scrolled = String(event.currentTarget.scrollLeft > 2);
        }}
      >
        <div className="filter-strip-inner">
          {mode === "requests" ? (
            <RequestChips />
          ) : (
            <>
              <GroupChips pool={pool} groups={groups} selectedGroups={selectedGroups} />
              <PickedTagChips />
            </>
          )}
        </div>
      </div>
      {mode === "performers" &&
        (desktop ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent align="end" aria-label="Усі фільтри" className="filter-panel">
              <FilterPanel state={state} desktop onClose={close} onPickTags={pickTags} />
            </PopoverContent>
          </Popover>
        ) : (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>{trigger}</SheetTrigger>
            <SheetContent aria-describedby={undefined}>
              <SheetTitle className="ui-sheet-title">Фільтри</SheetTitle>
              <SheetDescription className="sr-only">Групи спеціалістів, теги, місто й «Онлайн зараз».</SheetDescription>
              <FilterPanel state={state} desktop={false} onClose={close} onPickTags={pickTags} />
            </SheetContent>
          </Sheet>
        ))}
      {!desktop && <TagPicker context="filter" title="Теги спеціалістів" selected={pickedTags} labelOf={tagLabel} onToggle={pickTag} open={tagsOpen} onOpenChange={setTagsOpen} trigger={null} />}
    </div>
  );
};
