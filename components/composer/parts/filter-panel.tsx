"use client";

// Содержимое панели «Фільтри»: групи, теги, місто, «Онлайн зараз» і низ зі «Скинути» та «Показати N». Один вміст на два
// вигляди: поповер біля кнопки на десктопі й шторка на телефоні (`specialist-filters.tsx`).

import { GroupChips, PickedTagChips } from "@/components/composer/parts/filter-chips";
import { toggleCity } from "@/components/composer/use-specialist-filters";
import type { useFilterPanel } from "@/components/composer/use-filter-panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { clearFilter, cityFilter, onlineFilter } from "@/lib/map/filters";
import type { SpecialistFiltersState } from "@/components/composer/use-specialist-filters";
import { EVENTS, track } from "@/lib/telemetry/track";

export namespace FilterPanelTypes {
  export type Props = Pick<SpecialistFiltersState, "pool" | "groups" | "selectedGroups" | "allPerformers"> & {
    /** Кнопка або вибір тегів: на десктопі сам вибір, на телефоні чип, що закриває шторку й відкриває вибір. */
    tagControl: React.ReactNode;
    panel: ReturnType<typeof useFilterPanel>;
  };
  export type FooterProps = { shown: number; onReset: () => void; onClose: () => void };
}

export const FilterPanelBody = ({ pool, groups, selectedGroups, tagControl, panel }: FilterPanelTypes.Props) => (
  <>
    <section>
      <h3 className="filter-panel-title">Спеціалісти</h3>
      <div className="filter-panel-chips">
        <GroupChips pool={pool} groups={groups} selectedGroups={selectedGroups} />
      </div>
    </section>

    <section>
      <h3 className="filter-panel-title">Теги</h3>
      <div className="filter-panel-chips">
        <PickedTagChips />
        {tagControl}
      </div>
    </section>

    <section>
      <h3 className="filter-panel-title">Місто</h3>
      <div className="filter-panel-chips">
        <Button variant="bare" aria-pressed={panel.selectedCities.length === 0} onClick={() => clearFilter(cityFilter)} className="filter-chip">
          Будь-яке
        </Button>
        {panel.visibleCities.map((item) => (
          <Button key={item.id} variant="bare" aria-pressed={panel.selectedCities.includes(item.id)} onClick={() => toggleCity(item.id)} className="filter-chip">
            {item.name}
            <span className="filter-chip-count">{item.count}</span>
          </Button>
        ))}
        {panel.hiddenCities > 0 && (
          <Button variant="bare" onClick={panel.showAllCities} className="filter-chip filter-chip-more">
            ще {panel.hiddenCities}
          </Button>
        )}
      </div>
    </section>

    <div className="notif-row items-center">
      <label htmlFor="filter-online" className="cursor-pointer">
        Онлайн зараз
        <span className="filter-chip-count ml-1.5">{panel.onlineCount}</span>
      </label>
      <Switch
        id="filter-online"
        checked={panel.online}
        onCheckedChange={(on) => {
          track(EVENTS.filterOnlineToggled, { on });
          onlineFilter.set(on);
        }}
      />
    </div>
  </>
);

export const FilterPanelFooter = ({ shown, onReset, onClose }: FilterPanelTypes.FooterProps) => (
  <div className="filter-panel-footer">
    <Button variant="bare" onClick={onReset} className="filter-reset">
      Скинути
    </Button>
    <Button variant="bare" onClick={onClose} className="filter-apply">
      Показати {shown}
    </Button>
  </div>
);
