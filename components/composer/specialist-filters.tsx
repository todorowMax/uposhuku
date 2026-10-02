"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, SlidersHorizontal } from "lucide-react";
import { CITIES } from "@/lib/map/cities";
import { usePerformers } from "@/lib/map/performers";
import type { Performer } from "@/lib/map/types";
import { clearFilter, cityFilter, groupFilter, onlineFilter, tagMatches, toggleIn, useStore } from "@/lib/map/filters";
import { countGroups, filterPerformers } from "@/lib/map/groups";

/**
 * Фільтри під полем запиту, завширшки як саме поле. Спершу «Усі», далі
 * групи спеціалістів з лічильником, найбільша перша; групи й числа — з
 * тих, хто на карті з урахуванням тегів запиту, міста й «онлайн». Чип
 * вмикається й вимикається натисканням, вибрати можна кілька; «Усі»
 * знімає вибір. Стрічка гортається вбік, а «Фільтри» праворуч стоять на
 * місці й відкривають панель з усім: групи, міста, онлайн.
 */
export function SpecialistFilters({
  expanded,
  myRequests,
}: {
  expanded: boolean;
  /** Поки пишеш новий запит: кнопка ліворуч, щоб повернутися до своїх. */
  myRequests: { count: number; onOpen: () => void } | null;
}) {
  const selectedGroups = useStore(groupFilter);
  const cities = useStore(cityFilter);
  const online = useStore(onlineFilter);
  const matches = useStore(tagMatches);
  const performers = usePerformers();
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Лічильники груп — без вибору груп: число каже, скільки людей у групі.
  const pool = useMemo(
    () => filterPerformers(performers, { matches, groups: [], cities, online }),
    [performers, matches, cities, online]
  );
  const groups = useMemo(() => countGroups(pool), [pool]);
  const shown = selectedGroups.length
    ? groups.filter((item) => selectedGroups.includes(item.id)).reduce((sum, item) => sum + item.count, 0)
    : pool.length;

  // Під новий запит вибраних груп може не лишитися: такі знімаємо, а не показуємо порожню карту.
  useEffect(() => {
    const gone = selectedGroups.filter((id) => !groups.some((item) => item.id === id));
    for (const id of gone) toggleIn(groupFilter, id);
  }, [groups, selectedGroups]);

  // Панель закривається кліком повз неї й Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Скільки фільтрів з панелі ввімкнено: число на кнопці «Фільтри». */
  const active = selectedGroups.length + cities.length + Number(online);

  const groupChips = (
    <>
      <button
        type="button"
        aria-pressed={selectedGroups.length === 0}
        onClick={() => clearFilter(groupFilter)}
        className="filter-chip"
      >
        Усі
        <span className="filter-chip-count">{pool.length}</span>
      </button>
      {groups.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selectedGroups.includes(item.id)}
          onClick={() => toggleIn(groupFilter, item.id)}
          className="filter-chip"
        >
          {item.label}
          <span className="filter-chip-count">{item.count}</span>
        </button>
      ))}
    </>
  );

  return (
    <div ref={barRef} className="filter-bar" data-expanded={expanded}>
      {myRequests && (
        <button type="button" onClick={myRequests.onOpen} className="filter-chip filter-all">
          <ListChecks aria-hidden className="size-4" strokeWidth={1.9} />
          Мої запити
          <span className="filter-all-badge">{myRequests.count}</span>
        </button>
      )}
      <div
        className="filter-strip"
        role="toolbar"
        aria-label="Групи спеціалістів"
        // Згасання зліва лише тоді, коли стрічку вже прогорнули.
        onScroll={(event) => {
          event.currentTarget.dataset.scrolled = String(event.currentTarget.scrollLeft > 2);
        }}
      >
        <div className="filter-strip-inner">{groupChips}</div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="filter-chip filter-all"
        data-active={active > 0}
      >
        <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.9} />
        Фільтри
        {active > 0 && <span className="filter-all-badge">{active}</span>}
      </button>

      {open && (
        <FilterPanel
          groupChips={groupChips}
          pool={pool}
          shown={shown}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function FilterPanel({
  groupChips,
  pool,
  shown,
  onClose,
}: {
  groupChips: React.ReactNode;
  pool: Performer[];
  shown: number;
  onClose: () => void;
}) {
  const selectedCities = useStore(cityFilter);
  const online = useStore(onlineFilter);
  const matches = useStore(tagMatches);
  const groups = useStore(groupFilter);
  const performers = usePerformers();

  // Міста рахуємо без вибору міст і «онлайн» — так видно, де скільки людей узагалі.
  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const performer of filterPerformers(performers, { matches, groups, cities: [], online: false })) {
      counts.set(performer.cityId, (counts.get(performer.cityId) ?? 0) + 1);
    }
    return CITIES.filter((item) => counts.has(item.id))
      .map((item) => ({ ...item, count: counts.get(item.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [performers, matches, groups]);
  const onlineCount = pool.filter((performer) => performer.online).length;
  // Спершу найбільші міста: решта за «ще N», щоб «Онлайн» і кнопки були під рукою.
  const [allCities, setAllCities] = useState(false);
  const cityLimit = 8;
  const visibleCities = allCities
    ? cities
    : cities.filter((item, index) => index < cityLimit || selectedCities.includes(item.id));
  const hiddenCities = cities.length - visibleCities.length;

  const reset = () => {
    clearFilter(groupFilter);
    clearFilter(cityFilter);
    onlineFilter.set(false);
  };

  return (
    <div role="dialog" aria-label="Усі фільтри" className="filter-panel glass-panel">
      <section>
        <h3 className="filter-panel-title">Спеціалісти</h3>
        <div className="filter-panel-chips">{groupChips}</div>
      </section>

      <section>
        <h3 className="filter-panel-title">Місто</h3>
        <div className="filter-panel-chips">
          <button
            type="button"
            aria-pressed={selectedCities.length === 0}
            onClick={() => clearFilter(cityFilter)}
            className="filter-chip"
          >
            Будь-яке
          </button>
          {visibleCities.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selectedCities.includes(item.id)}
              onClick={() => toggleIn(cityFilter, item.id)}
              className="filter-chip"
            >
              {item.name}
              <span className="filter-chip-count">{item.count}</span>
            </button>
          ))}
          {hiddenCities > 0 && (
            <button type="button" onClick={() => setAllCities(true)} className="filter-chip filter-chip-more">
              ще {hiddenCities}
            </button>
          )}
        </div>
      </section>

      <label className="filter-switch">
        <span>
          Онлайн зараз
          <span className="filter-chip-count ml-1.5">{onlineCount}</span>
        </span>
        <input type="checkbox" checked={online} onChange={(event) => onlineFilter.set(event.target.checked)} />
        <span aria-hidden className="filter-switch-track" />
      </label>

      <div className="filter-panel-footer">
        <button type="button" onClick={reset} className="filter-reset">
          Скинути
        </button>
        <button type="button" onClick={onClose} className="filter-apply">
          Показати {shown}
        </button>
      </div>
    </div>
  );
}
