"use client";

// components/deals/stages-editor.tsx
//
// Етапи угоди у формі пропозиції: перегляд, ручне редагування й (для прямого переказу) швидкий вибір
// «Одним платежем» чи «30/70». Стан ручних етапів тримає форма, тут лише показ і правка.

import { Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daysWord, money } from "@/lib/deals/format";
import { splitAdvance, type StageDraft } from "@/lib/deals/stage-presets";
import { HOLD_DAYS, MAX_STAGE_DAYS, MAX_STAGES, type DealMethod } from "@/lib/deals/types";

export namespace StagesEditorTypes {
  /** Етап у полях форми: усе рядками, як вводить людина. */
  export type Edit = { title: string; amount: string; days: string };
  export type Props = {
    method: DealMethod;
    stages: StageDraft[];
    amount: number;
    days: number;
    custom: Edit[] | null;
    onCustom: (next: Edit[] | null) => void;
  };
}

/** Етапи чернетки в поля форми. */
export const toEdits = (stages: StageDraft[]): StagesEditorTypes.Edit[] =>
  stages.map((stage) => ({ title: stage.title, amount: String(stage.amount), days: String(stage.days) }));

export const StagesEditor = ({ method, stages, amount, days, custom, onCustom }: StagesEditorTypes.Props) => {
  const direct = method === "direct";
  const editStage = (index: number, patch: Partial<StagesEditorTypes.Edit>) =>
    onCustom((custom ?? toEdits(stages)).map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));

  return (
    <div className="deal-stages">
      <div className="flex items-center justify-between gap-2">
        <p className="pe-label !mb-0">Етапи</p>
        {!direct &&
          (custom ? (
            <Button variant="link" onClick={() => onCustom(null)} className="text-xs">
              Розбити автоматично
            </Button>
          ) : (
            <Button variant="link" onClick={() => onCustom(toEdits(stages))} className="text-xs">
              {stages.length > 1 ? "Змінити" : "Розбити на етапи"}
            </Button>
          ))}
      </div>

      {direct && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onCustom(null)} aria-pressed={!custom} className="w-auto">
            Одним платежем
          </Button>
          <Button variant="secondary" disabled={amount < 1 || days < 1} onClick={() => onCustom(toEdits(splitAdvance(amount, days)))} className="w-auto">
            30/70
          </Button>
        </div>
      )}

      {stages.length === 1 && !custom && (
        <>
          <p className="deal-stage-line">
            <span>{stages[0].title}</span>
            <span className="tabular-nums">
              {money(stages[0].amount)} · {stages[0].days} {daysWord(stages[0].days)}
            </span>
          </p>
          <p className="pe-hint">
            {direct
              ? "Один платіж на всю суму. Хочете платити частинами, оберіть «30/70» або розбийте на етапи: кожен етап оплачується окремо."
              : "Один етап: гроші заморожуються під усю роботу. Хочете платити частинами, розбийте на кілька етапів."}
          </p>
        </>
      )}
      {stages.length > 1 && !custom && !direct && (
        <p className="pe-hint">
          Один етап триває до {MAX_STAGE_DAYS} днів (холд {HOLD_DAYS} днів, решту лишаємо на перевірку), тож довшу роботу ділимо на етапи: кожен оплачується окремо.
        </p>
      )}

      {custom
        ? custom.map((stage, index) => (
            <div key={index} className="deal-stage-edit">
              <Input aria-label={`Назва етапу ${index + 1}`} value={stage.title} onChange={(event) => editStage(index, { title: event.target.value })} className="min-w-0 flex-1" />
              <Input
                aria-label={`Сума етапу ${index + 1}`}
                inputMode="numeric"
                value={stage.amount}
                onChange={(event) => editStage(index, { amount: event.target.value.replace(/[^\d\s]/g, "") })}
                className="w-24 tabular-nums"
              />
              <Input
                aria-label={`Днів в етапі ${index + 1}`}
                inputMode="numeric"
                value={stage.days}
                onChange={(event) => editStage(index, { days: event.target.value.replace(/\D/g, "").slice(0, 3) })}
                className="w-14 tabular-nums"
              />
              {custom.length > 1 && (
                <Button variant="icon" onClick={() => onCustom(custom.filter((_, i) => i !== index))} aria-label={`Прибрати етап ${index + 1}`} className="shrink-0">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))
        : stages.length > 1 &&
          stages.map((stage, index) => (
            <p key={index} className="deal-stage-line">
              <span>{stage.title}</span>
              <span className="tabular-nums">
                {money(stage.amount)} · {stage.days} {daysWord(stage.days)}
              </span>
            </p>
          ))}
      {custom && custom.length < MAX_STAGES && (
        <Button variant="link" onClick={() => onCustom([...custom, { title: `Етап ${custom.length + 1}`, amount: "", days: "" }])} className="inline-flex items-center gap-1 text-xs">
          <Plus className="size-3.5" />
          Додати етап
        </Button>
      )}
    </div>
  );
};
