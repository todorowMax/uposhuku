"use client";

// Оболонка всіх кроків «Стати на карту»: екран (DESIGN.md, «Шари») з заголовком, дією в шапці й закріпленим низом.
// «←» і Escape закривають усю панель; повернення на крок назад робить кнопка в шапці.

import { Screen } from "@/components/ui/screen";
import { placementOpenStore } from "@/lib/placement/client";

export namespace PlacementShellTypes {
  export type Props = {
    title: string;
    /** Кнопка в шапці справа: повернутися на крок назад. */
    action?: React.ReactNode;
    /** Головна кнопка кроку, закріплена внизу. */
    footer?: React.ReactNode;
    children: React.ReactNode;
  };
}

export const closePlacement = () => placementOpenStore.set(false);

export const PlacementShell = ({ title, action, footer, children }: PlacementShellTypes.Props) => (
  <Screen open onOpenChange={(next) => !next && closePlacement()} title={title} description="Розміщення профілю на карті: рівні, оплата й результат." desktop="dialog" action={action} footer={footer}>
    <div className="place-body">{children}</div>
  </Screen>
);
