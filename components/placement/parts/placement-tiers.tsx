"use client";

// Вибір рівня розміщення: три маркери у справжній пропорції, опис вибраного, попередження про те, що розмір можуть перебити.

import { RadioGroup, RadioTile } from "@/components/ui/radio-group";
import { TIER_PX } from "@/lib/placement/tiers";
import type { PlacementTier } from "@/lib/map/types";
import type { PlacementFlow } from "@/components/placement/use-placement-flow";

export namespace PlacementTiersTypes {
  export type Props = Pick<PlacementFlow, "current" | "selected" | "needed"> & {
    photo: string;
    name: string;
    onSelect: (tier: PlacementTier) => void;
  };
}

const PRICE = new Intl.NumberFormat("uk-UA");
const CHOICES = [
  { tier: 2, name: "Старт", description: "Невеликий маркер, і вас уже видно на карті." },
  { tier: 4, name: "Професійний", description: "Помітніший маркер і більше шансів отримати замовлення." },
  { tier: 6, name: "Топ", description: "Найбільший маркер: вас помітять першими." },
] as const;

export const PlacementTiers = ({ current, selected, needed, photo, name, onSelect }: PlacementTiersTypes.Props) => (
  <>
    <RadioGroup className="place-tiers" aria-label="Рівень розміщення" value={String(selected)} onValueChange={(value) => onSelect(Number(value) as PlacementTier)}>
      {CHOICES.map(({ tier, name: tierName }) => {
        const owned = tier <= current;
        const chosen = tier === selected;
        const size = Math.round(TIER_PX[tier - 1] * 1.6);
        return (
          <RadioTile key={tier} id={`place-tier-${tier}`} value={String(tier)} disabled={owned} className="place-tier" data-selected={chosen || undefined} data-owned={owned || undefined} data-current={tier === current || undefined}>
            <span className="place-tier-preview" aria-hidden="true">
              <span className="place-dot" style={{ width: size, height: size, ...(chosen && photo ? { backgroundImage: `url(${photo})` } : null) }}>
                {chosen && !photo && <span className="text-sm font-semibold">{name.trim().charAt(0) || "?"}</span>}
              </span>
            </span>
            <span className="place-tier-name">{tierName}</span>
            <span className="place-tier-price">{owned ? (tier === current ? "ваш рівень" : "є") : `${PRICE.format(needed(tier))} ₴`}</span>
          </RadioTile>
        );
      })}
    </RadioGroup>
    <p key={selected} className="place-choice-description" aria-live="polite">
      {CHOICES.find((choice) => choice.tier === selected)?.description}
    </p>
    <p className="place-warn" role="note">
      Інші виконавці можуть змінити ваш розмір на карті. Повернути його можна доплатою.
    </p>
  </>
);
