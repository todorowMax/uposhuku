"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ListChecks, Plus, SlidersHorizontal, X } from "@/components/icons";
import { allPerformersStore, applyRequestFilter, mapModeStore, mapRequestsStore, requestFilterStore, type RequestFilter } from "@/lib/feed/map-requests";
import { feedCollapsedStore } from "@/lib/requests/side-panel";
import { CITIES } from "@/lib/map/cities";
import { usePerformers } from "@/lib/map/performers";
import type { Performer } from "@/lib/map/types";
import { clearFilter, cityFilter, filterTags, groupFilter, onlineFilter, tagMatches, toggleIn, useStore } from "@/lib/map/filters";
import { TagPicker } from "@/components/tags/tag-picker";
import { tagLabel } from "@/lib/tags/engine";
import { countGroups, filterPerformers } from "@/lib/map/groups";
import { EVENTS, track } from "@/lib/telemetry/track";

const toggleGroup = (id: string) => {
  track(EVENTS.filterGroupToggled, { group: id, on: !groupFilter.get().includes(id) });
  toggleIn(groupFilter, id);
};
const toggleCity = (id: string) => {
  track(EVENTS.filterCityToggled, { city: id, on: !cityFilter.get().includes(id) });
  toggleIn(cityFilter, id);
};
const toggleTag = (id: string) => {
  track(EVENTS.filterTagToggled, { tag: id, on: !filterTags.get().includes(id) });
  toggleIn(filterTags, id);
};

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
  const pickedTags = useStore(filterTags);
  const performers = usePerformers();
  const [open, setOpen] = useState(false);
  // Панель лишається в DOM, поки програється анімація закриття.
  const [present, setPresent] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const mode = useStore(mapModeStore);
  const allPerformers = useStore(allPerformersStore);

  // Лічильники груп — без вибору груп: число каже, скільки людей у групі.
  const pool = useMemo(
    () => filterPerformers(performers, { matches: allPerformers ? null : matches, groups: [], cities, online }),
    [performers, matches, allPerformers, cities, online]
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

  useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

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
  const active = selectedGroups.length + cities.length + pickedTags.length + Number(online);

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
          onClick={() => toggleGroup(item.id)}
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
          <ListChecks aria-hidden className="size-4" />
          Мої запити
          <span className="filter-all-badge">{myRequests.count}</span>
        </button>
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
        <div className="filter-strip-inner">{mode === "requests" ? (
            <RequestChips />
          ) : (
            <>
              {groupChips}
              <PickedTagChips />
            </>
          )}</div>
      </div>
      {mode === "performers" && (
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="filter-chip filter-all filter-action"
        data-active={active > 0}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Фільтри
        {active > 0 && <span className="filter-all-badge">{active}</span>}
      </button>
      )}

      {present && mode === "performers" && (
        <FilterPanel
          groupChips={groupChips}
          pool={pool}
          shown={shown}
          allPerformers={allPerformers}
          open={open}
          onClose={() => setOpen(false)}
          onExited={() => setPresent(false)}
        />
      )}
    </div>
  );
}

function FilterPanel({
  groupChips,
  pool,
  shown,
  allPerformers,
  open,
  onClose,
  onExited,
}: {
  groupChips: React.ReactNode;
  pool: Performer[];
  shown: number;
  allPerformers: boolean;
  /** false: програємо закриття, а потім просимо прибрати панель (onExited). */
  open: boolean;
  onClose: () => void;
  onExited: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;

  // Розкривається від кнопки «Фільтри» (праворуч угорі): панель трохи виростає, блоки з'являються по черзі.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.killTweensOf(panel);
    gsap.killTweensOf(panel.children);
    gsap.set(panel, { transformOrigin: "100% 0" });
    const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    timeline.fromTo(panel, { opacity: 0, y: -12, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.36, clearProps: "opacity,transform" }, 0);
    timeline.fromTo(panel.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.32, stagger: 0.05, clearProps: "opacity,transform" }, 0.08);
    return () => {
      timeline.kill();
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    const panel = panelRef.current;
    if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      exitedRef.current();
      return;
    }
    gsap.killTweensOf(panel);
    gsap.killTweensOf(panel.children);
    const tween = gsap.to(panel, { opacity: 0, y: -8, scale: 0.98, duration: 0.18, ease: "power2.in", onComplete: () => exitedRef.current() });
    return () => {
      tween.kill();
    };
  }, [open]);

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
    clearFilter(filterTags);
    onlineFilter.set(false);
  };

  return (
    <div ref={panelRef} role="dialog" aria-label="Усі фільтри" className="filter-panel glass-panel" style={open ? undefined : { pointerEvents: "none" }}>
      <section>
        <h3 className="filter-panel-title">Спеціалісти</h3>
        <div className="filter-panel-chips">{groupChips}</div>
      </section>

      <section>
        <h3 className="filter-panel-title">Теги</h3>
        <div className="filter-panel-chips">
          <PickedTagChips />
          <TagPicker
            context="filter"
            title="Теги спеціалістів"
            selected={pickedTags}
            labelOf={tagLabel}
            onToggle={(id) => {
              toggleTag(id);
              return true;
            }}
            trigger={
              <button type="button" className="filter-chip" aria-label="Додати тег у фільтр">
                <Plus aria-hidden className="size-3.5" />
                Тег
              </button>
            }
          />
        </div>
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
              onClick={() => toggleCity(item.id)}
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
        <input type="checkbox" checked={online} onChange={(event) => {
            track(EVENTS.filterOnlineToggled, { on: event.target.checked });
            onlineFilter.set(event.target.checked);
          }} />
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

/** Теги, вибрані пошуком у «Фільтрах»: чип з хрестиком, клік прибирає тег із фільтра. */
function PickedTagChips() {
  const tags = useStore(filterTags);
  return (
    <>
      {tags.map((id) => (
        <button key={id} type="button" aria-pressed onClick={() => toggleTag(id)} className="filter-chip" title="Прибрати з фільтра">
          {tagLabel(id)}
          <X aria-hidden className="size-3" />
        </button>
      ))}
    </>
  );
}

/** Фільтри запитів: чипи замість груп спеціалістів. */
function RequestChips() {
  const { items, performer } = useStore(mapRequestsStore);
  const filter = useStore(requestFilterStore);
  const pickedTags = useStore(filterTags);
  // Рахуємо чужі запити, як і список «Запити для вас»: свої там не показуємо.
  const others = items.filter((item) => !item.own);
  const remote = others.filter((item) => !item.point).length;

  const chip = (id: RequestFilter, label: string) => (
    <button key={id} type="button" aria-pressed={filter === id} onClick={() => requestFilterStore.set(id)} className="filter-chip">
      {label}
      <span className="filter-chip-count">{applyRequestFilter(others, id, pickedTags).length}</span>
    </button>
  );

  return (
    <>
      {chip("all", "Усі")}
      {performer && chip("matched", "Під мої теги")}
      {chip("urgent", "Терміново")}
      {chip("budget", "З бюджетом")}
      {performer && remote > 0 && (
        <button
          type="button"
          aria-pressed={filter === "remote"}
          onClick={() => {
            requestFilterStore.set(filter === "remote" ? "all" : "remote");
            feedCollapsedStore.set(false);
          }}
          className="filter-chip"
          title="Запити без міста: на карті їх немає, вони лише в списку «Запити для вас»"
        >
          Віддалено
          <span className="filter-chip-count">{remote}</span>
        </button>
      )}
      <PickedTagChips />
      <TagPicker
        context="filter"
        title="Теги запитів"
        selected={pickedTags}
        labelOf={tagLabel}
        onToggle={(id) => {
          toggleTag(id);
          return true;
        }}
        trigger={
          <button type="button" className="filter-chip" aria-label="Додати тег у фільтр">
            <Plus aria-hidden className="size-3.5" />
            Тег
          </button>
        }
      />
    </>
  );
}
