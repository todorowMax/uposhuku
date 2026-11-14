// lib/feed/request-point.ts
//
// Де на карті стоїть запит. Запит з містом лягає поруч із центром міста, запит
// без міста («Віддалено») лягає в центр України. Зсув залежить лише від id, тож
// запити однієї точки не злипаються і не стрибають між оновленнями. Чиста логіка:
// її викликають і сервер (`lib/feed/feed.ts`), і власний запит на карті клієнта.

import { CITIES } from "@/lib/map/cities";

export interface RequestPoint {
  lat: number;
  lng: number;
}

/** Центр України: сюди йдуть запити без міста. */
export const REMOTE_CENTER: RequestPoint = { lat: 48.4, lng: 31.2 };

/** Зсув за довготою менший за зсув за широтою, бо на цій широті градус довготи коротший. */
const LNG_SQUEEZE = 0.65;

const hashOf = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Точка навколо центру: кут і відстань від хеша id, відстань у градусах широти. */
const scatter = (center: RequestPoint, id: string, { nearest, spread }: { nearest: number; spread: number }): RequestPoint => {
  const hash = hashOf(id);
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = nearest + ((hash >>> 9) % 50) * (spread / 50);
  return { lat: center.lat + Math.sin(angle) * radius, lng: center.lng + (Math.cos(angle) * radius) / LNG_SQUEEZE };
};

/**
 * Точка запиту на карті: місто із зсувом до ~0,08°, без міста (чи місто невідоме)
 * центр України із зсувом від 0,15° до ~0,7°, щоб віддалені запити стояли помітною
 * купкою, але не розсипалися по пів країни.
 */
export const requestPoint = (id: string, cityId: string | null): RequestPoint => {
  const city = cityId ? CITIES.find((item) => item.id === cityId) : undefined;
  return city ? scatter(city, id, { nearest: 0.03, spread: 0.05 }) : scatter(REMOTE_CENTER, id, { nearest: 0.15, spread: 0.55 });
};
