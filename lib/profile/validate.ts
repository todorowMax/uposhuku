// lib/profile/validate.ts
//
// Тіло запиту приходить від клієнта як є: лишаємо лише очікувані поля в
// розумних межах. Теги — лише ті, що є у словнику, решту відкидаємо.

import { CITIES } from "@/lib/map/cities";
import { combineTags } from "@/lib/tags/combine";
import { detectTags } from "@/lib/tags/detect";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { PROFILE_LIMITS, emptyProfile, missingForPublish, type Profile, type ProfileWork } from "./types";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const knownTags = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && TAGS_BY_ID.has(id)))].slice(0, max) : [];

/**
 * Теги поля рахує сервер, а не клієнт: з тексту (як це робить поле), плюс
 * додані вручну, мінус прибрані. Список `tags` з тіла запиту ігноруємо,
 * тож через API не дописати собі теги повз текст і ліміти.
 */
const resolveTags = (text: string, body: Record<string, unknown>, limits: { total: number; manual: number }) => {
  const auto = detectTags(text);
  const manualTags = knownTags(body.manualTags, limits.manual);
  const detected = new Set(auto);
  // Прихований тег має сенс, лише поки він знаходиться в тексті; ручний сильніший.
  const hiddenTags = knownTags(body.hiddenTags, limits.total).filter((id) => detected.has(id) && !manualTags.includes(id));
  return { tags: combineTags({ auto, manual: manualTags, hidden: hiddenTags, max: limits.total }), manualTags, hiddenTags };
};

const work = (value: unknown, index: number): ProfileWork | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const url = text(raw.url, PROFILE_LIMITS.url);
  // Лише http(s): посилання потім потрапить у href.
  if (url && !/^https?:\/\//i.test(url)) return null;
  const title = text(raw.title, PROFILE_LIMITS.workTitle);
  const description = text(raw.description, PROFILE_LIMITS.workDescription);
  return {
    id: text(raw.id, 40) || `work-${index}`,
    title,
    description,
    url,
    ...resolveTags(`${title}\n${description}`, raw, { total: PROFILE_LIMITS.workTags, manual: PROFILE_LIMITS.workManualTags }),
  };
};

/** Межі України з запасом: точка за ними — помилка, а не «ще один регіон». */
const BOUNDS = { latMin: 44, latMax: 52.6, lngMin: 22, lngMax: 40.5 } as const;

const location = (value: unknown): Profile["location"] | undefined => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const { lat, lng } = value as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) return undefined;
  // Тисячні градуса, ~100 м: точніше сервісу не треба, а людині спокійніше.
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
};

export const parseProfile = (body: Record<string, unknown> | null): Profile | string => {
  if (!body) return "Порожній запит.";
  const cityId = text(body.cityId, 40);
  if (cityId && !CITIES.some((city) => city.id === cityId)) return "Невідоме місто.";
  const point = location(body.location);
  if (point === undefined) return "Точка має бути в межах України.";
  const photo = typeof body.photo === "string" ? body.photo : "";
  // Або нове фото data URL (сервер покладе його в R2), або вже завантажена адреса /api/uploads/…
  if (photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) && !/^\/api\/uploads\/photos\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/.test(photo)) return "Фото має бути у форматі JPEG.";
  if (photo.startsWith("data:") && photo.length > PROFILE_LIMITS.photoBytes * 1.4) return "Фото завелике.";
  const rawWorks = Array.isArray(body.works) ? body.works.slice(0, PROFILE_LIMITS.works) : [];
  const works = rawWorks.map(work);
  if (works.includes(null)) return "Посилання на роботу має починатися з http:// або https://.";
  const specialty = text(body.specialty, PROFILE_LIMITS.specialty);
  const bio = text(body.bio, PROFILE_LIMITS.bio);
  const profile: Profile = {
    ...emptyProfile(),
    name: text(body.name, PROFILE_LIMITS.name),
    cityId,
    location: point,
    specialty,
    bio,
    ...resolveTags(`${specialty}\n${bio}`, body, { total: PROFILE_LIMITS.tags, manual: PROFILE_LIMITS.manualTags }),
    works: works as ProfileWork[],
    photo,
    published: body.published === true,
  };
  // Показувати на карті без обов'язкового не можна: чернетка лишається, але приватна.
  if (profile.published) {
    const missing = missingForPublish(profile);
    if (missing.length) return `Щоб опублікувати профіль, додайте: ${missing.join(", ")}.`;
  }
  return profile;
};
