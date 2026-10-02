// lib/profile/to-performer.ts
//
// Профіль → виконавець на карті. Тип тут ще той самий, що в демо
// (lib/map/types), тож карта, фільтри й підбір працюють без змін.

import { CITIES } from "@/lib/map/cities";
import type { Performer, PlacementTier, PortfolioWork, WorkKind } from "@/lib/map/types";
import { profileTags, type Profile, type ProfileWork } from "./types";

/** Який умовний екран малювати на мініатюрі, поки немає скриншота. */
const KIND_BY_TAG: [string, WorkKind][] = [
  ["telegram-bot", "bot"], ["chat-bot", "bot"], ["viber-bot", "bot"], ["automation", "bot"],
  ["mobile-app", "app"], ["ios-app", "app"], ["android-app", "app"], ["flutter", "app"], ["react-native", "app"],
  ["crm", "dashboard"], ["dashboard", "dashboard"], ["admin-panel", "dashboard"], ["saas", "dashboard"], ["web-app", "dashboard"],
  ["ui-ux-design", "design"], ["branding", "design"], ["graphic-design", "design"],
];

const kindOf = (tags: string[]): WorkKind => {
  for (const [tag, kind] of KIND_BY_TAG) if (tags.includes(tag)) return kind;
  return "site";
};

const hueOf = (value: string) => {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 360;
};

const toWork = (work: ProfileWork): PortfolioWork => ({
  id: work.id,
  title: work.title.trim() || "Без назви",
  kind: kindOf(work.tags),
  hue: hueOf(work.id + work.title),
  description: work.description.trim() || undefined,
  url: work.url.trim() || undefined,
  tags: work.tags,
});

/**
 * Власний профіль на карті. Точка — у межах свого міста з невеликим
 * зсувом, щоб не стояти точно на підписі міста. Рівень — за оплатою розміщення.
 */
export const profileToPerformer = (profile: Profile, userId: string, avatarIndex: number, tier: PlacementTier = 1): Performer | null => {
  const city = CITIES.find((item) => item.id === profile.cityId);
  if (!city) return null;
  return {
    id: `me-${userId}`,
    cityId: city.id,
    lat: city.lat + 0.045,
    lng: city.lng - 0.07,
    online: true,
    tier,
    avatarIndex,
    name: profile.name.trim(),
    specialty: profile.specialty.trim(),
    tags: profileTags(profile),
    bio: profile.bio.trim(),
    works: profile.works.map(toWork),
    photo: profile.photo || undefined,
    mine: true,
  };
};
