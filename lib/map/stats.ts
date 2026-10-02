// lib/map/stats.ts
//
// Цифри профілю в картці: на платформі, замовлень, рейтинг. Поки немає
// бекенду, для демо-виконавців вони вигадані й стабільні для людини, а
// для власного профілю нульові.

import type { Performer } from "./types";

const metric = (id: string, salt: number) => {
  let value = salt;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
};

export const performerStats = (performer: Pick<Performer, "id" | "mine">) =>
  performer.mine
    ? { months: 0, orders: 0, rating: "—" }
    : {
        months: 3 + (metric(performer.id, 17) % 23),
        orders: 4 + (metric(performer.id, 31) % 55),
        rating: (4.7 + (metric(performer.id, 73) % 4) / 10).toFixed(1),
      };
