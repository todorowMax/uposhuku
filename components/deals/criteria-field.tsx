// components/deals/criteria-field.tsx
//
// Поле «Що вважаємо готовим»: одне на форму умов у чаті й форму пропозиції по відгуку.

import { Field, Textarea } from "@/components/ui/input";
import { CRITERIA_MAX } from "@/lib/deals/dispute-aids";

export namespace CriteriaFieldTypes {
  export interface Props {
    id: string;
    value: string;
    onChange: (value: string) => void;
  }
}

export const CriteriaField = ({ id, value, onChange }: CriteriaFieldTypes.Props) => (
  <Field
    label="Що вважаємо готовим"
    optional
    htmlFor={id}
    hint="Після того як друга сторона прийме умови, це не змінюється. Побачать обидві сторони і, якщо буде спір, модератор."
  >
    <Textarea
      id={id}
      rows={2}
      value={value}
      maxLength={CRITERIA_MAX}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Макет у Figma і верстка, що відкривається на телефоні"
    />
  </Field>
);
