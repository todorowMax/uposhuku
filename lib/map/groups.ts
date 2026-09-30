// lib/map/groups.ts
//
// Групи спеціалістів для фільтрів під полем запиту. Людина належить до
// групи за своїм основним тегом — першим у профілі, який є в якійсь групі.
// Чипи будуються з даних: показуємо лише групи, у яких хтось є, і
// найбільша стоїть першою.

import type { Performer } from "./types";

export interface SpecialistGroup {
  id: string;
  label: string;
  /** Теги, що роблять людину спеціалістом цієї групи. Id з lib/tags. */
  tags: string[];
}

export const SPECIALIST_GROUPS: SpecialistGroup[] = [
  { id: "design", label: "Дизайн", tags: ["ui-ux-design", "branding", "graphic-design", "redesign", "ux-research", "figma", "motion-design"] },
  { id: "web", label: "Сайти й веб", tags: ["website", "landing", "web-app", "online-store", "react", "nextjs", "tilda", "pwa", "wordpress"] },
  { id: "mobile", label: "Мобільні застосунки", tags: ["mobile-app", "ios-app", "android-app", "flutter", "react-native", "swift", "kotlin"] },
  { id: "automation", label: "Боти й автоматизація", tags: ["automation", "telegram-bot", "chat-bot", "n8n", "make-com", "zapier", "parser", "integration-service"] },
  { id: "business", label: "CRM і бізнес-системи", tags: ["crm", "crm-setup", "admin-panel", "dashboard", "erp", "internal-tool"] },
  { id: "backend", label: "Бекенд і сервіси", tags: ["api-backend", "saas", "booking-platform", "devops"] },
];

const GROUP_BY_TAG = new Map(SPECIALIST_GROUPS.flatMap((group) => group.tags.map((tag) => [tag, group.id] as const)));

/** Основна група людини: за першим її тегом, що є в якійсь групі. */
export const primaryGroup = (tags: string[]): string | undefined => {
  for (const tag of tags) {
    const group = GROUP_BY_TAG.get(tag);
    if (group) return group;
  }
  return undefined;
};

/** Групи з кількістю людей, найбільша перша; порожніх немає. */
export const countGroups = (performers: Pick<Performer, "tags">[]) => {
  const counts = new Map<string, number>();
  for (const performer of performers) {
    const group = primaryGroup(performer.tags);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return SPECIALIST_GROUPS.filter((group) => counts.has(group.id))
    .map((group) => ({ ...group, count: counts.get(group.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
};

export interface PerformerFilters {
  /** Хто під теги запиту; null — усі. */
  matches: ReadonlySet<string> | null;
  /** Будь-яка з вибраних груп; порожньо — усі. */
  groups: readonly string[];
  /** Будь-яке з вибраних міст; порожньо — усі. */
  cities: readonly string[];
  online: boolean;
}

/**
 * Хто лишається на карті після всіх фільтрів. Без групи — щоб порахувати
 * лічильники чипів: число в чипі каже, скільки буде, якщо його вибрати.
 */
export const filterPerformers = <P extends Pick<Performer, "id" | "tags" | "cityId" | "online">>(
  performers: P[],
  { matches, groups, cities, online }: PerformerFilters
): P[] =>
  performers.filter(
    (performer) =>
      (!matches || matches.has(performer.id)) &&
      (groups.length === 0 || groups.includes(primaryGroup(performer.tags) ?? "")) &&
      (cities.length === 0 || cities.includes(performer.cityId)) &&
      (!online || performer.online)
  );
