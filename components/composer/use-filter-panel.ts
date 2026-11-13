"use client";

// components/composer/use-filter-panel.ts
//
// Дані панелі «Фільтри»: міста з лічильниками (спершу найбільші, решта за «ще N»), скільки людей онлайн, скидання.
// Перенесено з компонента без змін поведінки.

import { useMemo, useState } from "react";
import { clearFilter, cityFilter, filterTags, groupFilter, onlineFilter, tagMatches, useStore } from "@/lib/map/filters";
import { CITIES } from "@/lib/map/cities";
import { filterPerformers } from "@/lib/map/groups";
import { usePerformers } from "@/lib/map/performers";
import type { Performer } from "@/lib/map/types";

const CITY_LIMIT = 8;

export const useFilterPanel = (pool: Performer[], allPerformers: boolean) => {
  const selectedCities = useStore(cityFilter);
  const online = useStore(onlineFilter);
  const matches = useStore(tagMatches);
  const groups = useStore(groupFilter);
  const pickedTags = useStore(filterTags);
  const performers = usePerformers();

  // Міста рахуємо без вибору міст і «онлайн» — так видно, де скільки людей узагалі.
  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const performer of filterPerformers(performers, { matches: allPerformers ? null : matches, groups, cities: [], online: false })) {
      counts.set(performer.cityId, (counts.get(performer.cityId) ?? 0) + 1);
    }
    return CITIES.filter((item) => counts.has(item.id))
      .map((item) => ({ ...item, count: counts.get(item.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [performers, matches, allPerformers, groups]);
  const onlineCount = pool.filter((performer) => performer.online).length;
  const [allCities, setAllCities] = useState(false);
  const visibleCities = allCities ? cities : cities.filter((item, index) => index < CITY_LIMIT || selectedCities.includes(item.id));
  const hiddenCities = cities.length - visibleCities.length;

  const reset = () => {
    clearFilter(groupFilter);
    clearFilter(cityFilter);
    clearFilter(filterTags);
    onlineFilter.set(false);
  };

  return { selectedCities, online, pickedTags, visibleCities, hiddenCities, onlineCount, showAllCities: () => setAllCities(true), reset };
};
