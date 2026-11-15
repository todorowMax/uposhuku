"use client";

// components/account/parts/matching-settings.tsx
//
// Які запити під мої теги варті сповіщення: наскільки точний збіг тегів, мінімальний бюджет і з яких міст.
// Показується лише коли сповіщення «Запити під мої теги» увімкнено. Зміни діють одразу (setPrefs).

import { useId, useState } from "react";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { MATCH_AREAS, MATCH_LEVELS, type MatchingPrefs } from "@/lib/notification-prefs";
import { CITIES } from "@/lib/map/cities";
import { setPrefs } from "@/lib/notifications";

export namespace MatchingSettingsTypes {
  export type Props = { matching: MatchingPrefs };
}

const LEVELS: Record<string, { title: string; hint: string }> = {
  "0.6": { title: "Схожі теги", hint: "Той самий тег, батьківський чи дочірній." },
  "0.8": { title: "Близькі й точні", hint: "Лише той самий тег або його найближчий родич." },
  "1": { title: "Лише точний тег", hint: "Тег запиту є у вашому профілі." },
};

const AREAS: Record<(typeof MATCH_AREAS)[number], { title: string; hint: string }> = {
  all: { title: "Уся Україна", hint: "Як зараз: запити з будь-якого міста." },
  own: { title: "Лише моє місто", hint: "Запити з міста профілю й без міста («Віддалено»)." },
  chosen: { title: "Вибрані міста", hint: "Запити з обраних міст і без міста («Віддалено»)." },
};

const levelKey = (value: number) => String(value);

export const MatchingSettings = ({ matching }: MatchingSettingsTypes.Props) => {
  const id = useId();
  const [budget, setBudget] = useState(matching.minBudget > 0 ? String(matching.minBudget) : "");

  const commitBudget = () => {
    const value = Number(budget.replace(/\s/g, ""));
    setPrefs({ matching: { minBudget: Number.isFinite(value) && value > 0 ? Math.round(value) : 0 } });
  };

  const toggleCity = (cityId: string, on: boolean) => {
    const rest = matching.cityIds.filter((item) => item !== cityId);
    setPrefs({ matching: { cityIds: on ? [...rest, cityId] : rest } });
  };

  return (
    <div className="grid gap-3">
      <h3 className="pe-label mt-2">Які запити під мої теги</h3>
      <RadioGroup value={levelKey(matching.minMatch)} onValueChange={(value) => setPrefs({ matching: { minMatch: Number(value) } })} aria-label="Наскільки точний збіг тегів">
        {MATCH_LEVELS.map((level) => (
          <RadioCard key={level} id={`${id}-level-${level}`} value={levelKey(level)} title={LEVELS[levelKey(level)].title} hint={LEVELS[levelKey(level)].hint} />
        ))}
      </RadioGroup>

      <div>
        <label htmlFor={`${id}-budget`} className="pe-label">
          Мінімальний бюджет, ₴
        </label>
        <Input
          id={`${id}-budget`}
          inputMode="numeric"
          value={budget}
          placeholder="Будь-який"
          onChange={(event) => setBudget(event.target.value.replace(/[^\d\s]/g, ""))}
          onBlur={commitBudget}
          className="tabular-nums"
        />
        <p className="pe-hint mt-1.5">Запити без вказаного бюджету ми все одно покажемо.</p>
      </div>

      <RadioGroup value={matching.area} onValueChange={(value) => setPrefs({ matching: { area: MATCH_AREAS.find((area) => area === value) ?? "all" } })} aria-label="З яких міст запити">
        {MATCH_AREAS.map((area) => (
          <RadioCard key={area} id={`${id}-area-${area}`} value={area} title={AREAS[area].title} hint={AREAS[area].hint} />
        ))}
      </RadioGroup>

      {matching.area === "chosen" && (
        <fieldset className="grid max-h-48 gap-1 overflow-y-auto">
          <legend className="pe-label">Міста</legend>
          {CITIES.map((city) => (
            <CheckboxField key={city.id} id={`${id}-city-${city.id}`} label={city.name} checked={matching.cityIds.includes(city.id)} onCheckedChange={(checked) => toggleCity(city.id, checked === true)} />
          ))}
          {matching.cityIds.length === 0 && <p className="pe-hint">Оберіть хоча б одне місто, інакше сповіщень про запити з міст не буде.</p>}
        </fieldset>
      )}
    </div>
  );
};
