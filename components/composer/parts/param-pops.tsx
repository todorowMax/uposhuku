"use client";

// Вміст вікон умов запиту: бюджет (готові суми й своя), термін, місце (віддалено чи місто зі списку).

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CITIES } from "@/lib/map/cities";
import { DEADLINES, type Deadline } from "@/lib/requests/types";
import type { RequestParamsTypes, useRequestParams } from "@/components/composer/use-request-params";

export namespace ParamPopsTypes {
  export type Params = ReturnType<typeof useRequestParams>;
  export type Props = { value: RequestParamsTypes.Value; params: Params };
}

const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, "uk"));
const PRICE = new Intl.NumberFormat("uk-UA");
const BUDGET_PRESETS = [3000, 10000, 25000, 50000] as const;

export const BudgetPop = ({ value, params }: ParamPopsTypes.Props) => (
  <>
    <p className="param-pop-title">Скільки готові витратити, максимум</p>
    <div className="param-presets">
      {BUDGET_PRESETS.map((preset) => (
        <Button key={preset} variant="bare" className="param-option" data-on={value.budget === preset || undefined} onClick={() => params.pickBudget(preset)}>
          до {PRICE.format(preset)} ₴
        </Button>
      ))}
    </div>
    <label htmlFor="param-budget" className="sr-only">
      Своя сума, гривні
    </label>
    <div className="param-custom-amount mt-2">
      <Input
        id="param-budget"
        inputMode="numeric"
        value={params.budgetText}
        onChange={(event) => params.setBudgetText(event.target.value.replace(/[^\d]/g, "").slice(0, 8))}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          params.applyBudget();
        }}
        placeholder="Своя сума, ₴"
        className="min-h-9.5 min-w-0 flex-1 px-3 text-sm tabular-nums"
      />
      <Button variant="offer" onClick={params.applyBudget}>
        Готово
      </Button>
    </div>
    <p className="param-pop-hint">Не знаєте? Не вказуйте: виконавці самі запропонують ціну.</p>
  </>
);

export const DeadlinePop = ({ value, params }: ParamPopsTypes.Props) => (
  <>
    <p className="param-pop-title">Коли потрібен результат</p>
    <div className="grid gap-1">
      {(Object.keys(DEADLINES) as Deadline[]).map((key) => (
        <Button
          key={key}
          variant="bare"
          className="param-row"
          data-on={value.deadline === key || undefined}
          onClick={() => {
            params.set({ deadline: value.deadline === key ? null : key });
            params.close();
          }}
        >
          {DEADLINES[key]}
        </Button>
      ))}
    </div>
  </>
);

export const CityPop = ({ value, params }: ParamPopsTypes.Props) => (
  <>
    <p className="param-pop-title">Де потрібен виконавець</p>
    <Button
      variant="bare"
      className="param-row"
      data-on={value.remote || undefined}
      onClick={() => {
        params.set({ remote: true, cityId: null });
        params.close();
      }}
    >
      Віддалено, місто не важливе
    </Button>
    <p className="param-pop-title mt-2">Або місто</p>
    <div className="grid gap-1">
      {CITY_OPTIONS.map((city) => (
        <Button
          key={city.id}
          variant="bare"
          className="param-row"
          data-on={value.cityId === city.id || undefined}
          onClick={() => {
            params.set({ cityId: city.id, remote: false });
            params.close();
          }}
        >
          {city.name}
        </Button>
      ))}
    </div>
  </>
);
