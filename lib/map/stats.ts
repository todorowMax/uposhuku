// lib/map/stats.ts
//
// Цифри профілю в картці: на платформі, замовлень, рейтинг. Їх рахує сервер
// (lib/server/stats-repo.ts) і кладе в виконавця; тут лише формат для показу.

import type { Performer } from "./types";

export const performerStats = (performer: Pick<Performer, "stats">) => ({
  months: performer.stats?.months ?? 0,
  orders: performer.stats?.orders ?? 0,
  rating: performer.stats?.rating ? performer.stats.rating.toFixed(1) : "—",
});
