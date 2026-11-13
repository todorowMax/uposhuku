"use client";

// Оплата розміщення: сума, рівень після оплати, згода з офертою. Кнопку «Оплатити» тримає закріплений низ екрана.

import { CheckboxField } from "@/components/ui/checkbox";
import type { PlacementFlow } from "@/components/placement/use-placement-flow";
import { TIER_NAMES } from "@/lib/placement/tiers";

export namespace PlacementCheckoutTypes {
  export type Props = Pick<PlacementFlow, "amount" | "tierAfter" | "agreed"> & {
    processing: boolean;
    onAgree: (value: boolean) => void;
  };
}

const PRICE = new Intl.NumberFormat("uk-UA");

export const PlacementCheckout = ({ amount, tierAfter, agreed, processing, onAgree }: PlacementCheckoutTypes.Props) => (
  <>
    <div className="place-checkout">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Оплата через monobank</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{PRICE.format(amount)} ₴</p>
      <p className="text-xs text-ink-muted">
        Розміщення на карті, рівень {tierAfter}: {TIER_NAMES[tierAfter]}
      </p>
    </div>
    <CheckboxField
      id="place-offer"
      checked={agreed}
      disabled={processing}
      onCheckedChange={(value) => onAgree(value === true)}
      label={
        <>
          Погоджуюсь з{" "}
          <a href="/offer" target="_blank" rel="noreferrer" className="auth-link">
            договором публічної оферти
          </a>{" "}
          і прошу змінити рівень розміщення одразу після оплати. Розумію, що протягом 14 днів можу попросити повернення коштів.
        </>
      }
    />
    <p className="pe-hint">Оплата карткою через monobank. Після оплати рівень оновиться автоматично.</p>
  </>
);
