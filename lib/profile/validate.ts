// lib/profile/validate.ts
//
// Тіло запиту приходить від клієнта як є: лишаємо лише очікувані поля в
// розумних межах. Теги — лише ті, що є у словнику, решту відкидаємо.

import { CITIES } from "@/lib/map/cities";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { PROFILE_LIMITS, emptyProfile, missingForPublish, type Profile, type ProfileWork } from "./types";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const tags = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && TAGS_BY_ID.has(id)))].slice(0, 40)
    : [];

const work = (value: unknown, index: number): ProfileWork | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const url = text(raw.url, PROFILE_LIMITS.url);
  // Лише http(s): посилання потім потрапить у href.
  if (url && !/^https?:\/\//i.test(url)) return null;
  return {
    id: text(raw.id, 40) || `work-${index}`,
    title: text(raw.title, PROFILE_LIMITS.workTitle),
    description: text(raw.description, PROFILE_LIMITS.workDescription),
    url,
    tags: tags(raw.tags),
  };
};

export const parseProfile = (body: Record<string, unknown> | null): Profile | string => {
  if (!body) return "Порожній запит.";
  const cityId = text(body.cityId, 40);
  if (cityId && !CITIES.some((city) => city.id === cityId)) return "Невідоме місто.";
  const photo = typeof body.photo === "string" ? body.photo : "";
  if (photo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)) return "Фото має бути у форматі JPEG.";
  if (photo.length > PROFILE_LIMITS.photoBytes * 1.4) return "Фото завелике.";
  const rawWorks = Array.isArray(body.works) ? body.works.slice(0, PROFILE_LIMITS.works) : [];
  const works = rawWorks.map(work);
  if (works.includes(null)) return "Посилання на роботу має починатися з http:// або https://.";
  const profile: Profile = {
    ...emptyProfile(),
    name: text(body.name, PROFILE_LIMITS.name),
    cityId,
    specialty: text(body.specialty, PROFILE_LIMITS.specialty),
    bio: text(body.bio, PROFILE_LIMITS.bio),
    tags: tags(body.tags),
    works: works as ProfileWork[],
    photo,
    published: body.published === true,
  };
  // Показувати на карті без обов'язкового не можна: чернетка лишається, але приватна.
  if (profile.published) {
    const missing = missingForPublish(profile);
    if (missing.length) return `Щоб показатися на карті, додайте: ${missing.join(", ")}.`;
  }
  return profile;
};
