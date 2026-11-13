"use client";

// components/composer/use-specialist-filters.ts
//
// Стан фільтрів карти: групи спеціалістів з лічильниками, скільки людей покаже панель, число ввімкнених фільтрів.
// Перенесено з компонента без змін поведінки; розмітка в `specialist-filters.tsx` і `parts/`.

import { useEffect, useMemo } from "react";
import { allPerformersStore, mapModeStore } from "@/lib/feed/map-requests";
import { cityFilter, filterTags, groupFilter, onlineFilter, tagMatches, toggleIn, useStore } from "@/lib/map/filters";
import { countGroups, filterPerformers } from "@/lib/map/groups";
import { usePerformers } from "@/lib/map/performers";
import { EVENTS, track } from "@/lib/telemetry/track";

export const toggleGroup = (id: string) => {
  track(EVENTS.filterGroupToggled, { group: id, on: !groupFilter.get().includes(id) });
  toggleIn(groupFilter, id);
};
export const toggleCity = (id: string) => {
  track(EVENTS.filterCityToggled, { city: id, on: !cityFilter.get().includes(id) });
  toggleIn(cityFilter, id);
};
export const toggleTag = (id: string) => {
  track(EVENTS.filterTagToggled, { tag: id, on: !filterTags.get().includes(id) });
  toggleIn(filterTags, id);
};

/** Для `TagPicker`: вибір тегу завжди приймається (ліміту в фільтрі немає). */
export const pickTag = (id: string) => {
  toggleTag(id);
  return true;
};

export const useSpecialistFilters = () => {
  const selectedGroups = useStore(groupFilter);
  const cities = useStore(cityFilter);
  const online = useStore(onlineFilter);
  const matches = useStore(tagMatches);
  const pickedTags = useStore(filterTags);
  const performers = usePerformers();
  const mode = useStore(mapModeStore);
  const allPerformers = useStore(allPerformersStore);

  // Лічильники груп — без вибору груп: число каже, скільки людей у групі.
  const pool = useMemo(() => filterPerformers(performers, { matches: allPerformers ? null : matches, groups: [], cities, online }), [performers, matches, allPerformers, cities, online]);
  const groups = useMemo(() => countGroups(pool), [pool]);
  const shown = selectedGroups.length ? groups.filter((item) => selectedGroups.includes(item.id)).reduce((sum, item) => sum + item.count, 0) : pool.length;

  // Під новий запит вибраних груп може не лишитися: такі знімаємо, а не показуємо порожню карту.
  useEffect(() => {
    const gone = selectedGroups.filter((id) => !groups.some((item) => item.id === id));
    for (const id of gone) toggleIn(groupFilter, id);
  }, [groups, selectedGroups]);

  /** Скільки фільтрів з панелі ввімкнено: число на кнопці «Фільтри». */
  const active = selectedGroups.length + cities.length + pickedTags.length + Number(online);

  return { selectedGroups, pool, groups, shown, active, mode, allPerformers };
};

export type SpecialistFiltersState = ReturnType<typeof useSpecialistFilters>;
