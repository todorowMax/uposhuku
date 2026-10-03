// lib/server/stats-repo.ts
//
// Цифри виконавців для карти й профілів: місяці з реєстрації, завершені угоди,
// середня оцінка. Одним запитом на таблицю, без прив'язки до списку id.

import { eq, sql } from "drizzle-orm";
import { deals, reviews, users } from "@/db/schema";
import type { PerformerStats } from "@/lib/map/types";
import { getDb } from "./db";

const MONTH = 30 * 24 * 60 * 60 * 1000;

/** Статистика всіх виконавців, у кого є профіль або хоч якась активність: performerId (me-…) → цифри. */
export const allPerformerStats = async (now = Date.now()): Promise<Map<string, PerformerStats>> => {
  const db = getDb();
  const [people, done, rated] = await Promise.all([
    db.select({ id: users.id, createdAt: users.createdAt }).from(users),
    db.select({ performerId: deals.performerId, count: sql<number>`count(*)` }).from(deals).where(eq(deals.status, "completed")).groupBy(deals.performerId),
    db.select({ performerId: reviews.performerId, average: sql<number>`avg(${reviews.stars})`, count: sql<number>`count(*)` }).from(reviews).groupBy(reviews.performerId),
  ]);
  const orders = new Map(done.map((row) => [row.performerId, Number(row.count)]));
  const ratings = new Map(rated.map((row) => [row.performerId, { average: Math.round(Number(row.average) * 10) / 10, count: Number(row.count) }]));
  const result = new Map<string, PerformerStats>();
  for (const person of people) {
    const performerId = `me-${person.id}`;
    const rating = ratings.get(performerId);
    result.set(performerId, { months: Math.max(0, Math.floor((now - person.createdAt) / MONTH)), orders: orders.get(performerId) ?? 0, rating: rating?.average ?? null, reviews: rating?.count ?? 0 });
  }
  return result;
};

export const performerStatsOf = async (userId: string): Promise<PerformerStats> => (await allPerformerStats()).get(`me-${userId}`) ?? { months: 0, orders: 0, rating: null, reviews: 0 };
