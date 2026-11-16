"use client";

// components/composer/request-params.tsx
//
// Умови запиту чипами поруч із кнопкою «Знайти»: бюджет, термін, де. Необов'язкові: людина може нічого не вказувати.
// Кожен чип відкриває вікно з готовими варіантами, щоб не набирати руками: на телефоні шторка, від 768 px поповер
// (DESIGN.md, «Шари»). Стан у `use-request-params.ts`, вікна в `parts/`.

import { CalendarClock, MapPin, Send, Wallet, X } from "@/components/icons";
import { BudgetPop, CityPop, DeadlinePop } from "@/components/composer/parts/param-pops";
import { ParamPopup } from "@/components/composer/parts/param-popup";
import { EMPTY_PARAMS, useRequestParams, type RequestParamsTypes } from "@/components/composer/use-request-params";
import { Button } from "@/components/ui/button";
import { deadlineLabel } from "@/lib/requests/format";

export type RequestParamsValue = RequestParamsTypes.Value;
export { EMPTY_PARAMS };

export namespace RequestParamsScreenTypes {
  export type Props = { value: RequestParamsValue; onChange: (value: RequestParamsValue) => void };
}

const PRICE = new Intl.NumberFormat("uk-UA");

export const RequestParams = ({ value, onChange }: RequestParamsScreenTypes.Props) => {
  const params = useRequestParams(value, onChange);
  const { open, place } = params;

  /** Чип-кнопка й, коли значення задано, хрестик «Прибрати». Вікно відкриває сама кнопка (trigger). */
  const chip = (kind: RequestParamsTypes.Kind, icon: React.ReactNode, label: string, filled: string | null | undefined, clear: () => void, content: React.ReactNode, tall = false) => (
    <span className="param-chip" data-filled={Boolean(filled) || undefined} data-open={open === kind || undefined}>
      <ParamPopup
        open={open === kind}
        onOpenChange={params.openTo(kind)}
        title={label}
        tall={tall}
        trigger={
          <Button variant="bare" aria-expanded={open === kind} className="param-chip-main">
            {icon}
            <span className="param-chip-label">{filled ?? label}</span>
          </Button>
        }
      >
        {content}
      </ParamPopup>
      {filled && (
        <Button variant="bare" onClick={clear} aria-label={`Прибрати: ${label}`} className="param-chip-clear">
          <X className="size-3" />
        </Button>
      )}
    </span>
  );

  return (
    <div className="composer-params" role="group" aria-label="Умови запиту">
      {chip("budget", <Wallet className="size-3.5 shrink-0" />, "Бюджет", value.budget ? `до ${PRICE.format(value.budget)} ₴` : null, params.clearBudget, <BudgetPop value={value} params={params} />)}
      {chip("deadline", <CalendarClock className="size-3.5 shrink-0" />, "Термін", deadlineLabel(value, new Date()), params.clearDeadline, <DeadlinePop value={value} params={params} />)}
      {chip("city", <MapPin className="size-3.5 shrink-0" />, "Де", place, () => params.set({ cityId: null, remote: false }), <CityPop value={value} params={params} />, true)}
      {params.channelEnabled && (
        <span className="param-chip" data-filled={value.channel || undefined}>
          <Button
            variant="bare"
            role="switch"
            aria-checked={value.channel}
            onClick={() => params.set({ channel: !value.channel })}
            className="param-chip-main"
            title="Покажемо запит у нашому Telegram-каналі без ваших контактів. Відгукнутися можна лише на сайті."
          >
            <Send className="size-3.5 shrink-0" />
            <span className="param-chip-label">{value.channel ? "У Telegram-каналі" : "Не в каналі"}</span>
          </Button>
        </span>
      )}
    </div>
  );
};
