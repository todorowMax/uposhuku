// lib/requests/mock-responses.ts
//
// Відгуки-заглушки, поки виконавців на платформі немає: відповідають ті,
// хто підходить під теги запиту, по одному з інтервалом у кілька секунд
// від публікації. Детерміновано: той самий запит — ті самі відгуки, тож
// опитування раз на кілька секунд бачить, як список росте, а не міняється.
// Справжні відгуки лежатимуть у D1 (таблиця responses) і прийдуть через
// WebSocket з Durable Object запиту.

import { CITIES } from "@/lib/map/cities";
import { DEMO_PERFORMERS } from "@/lib/map/demo";
import { primaryGroup } from "@/lib/map/groups";
import { getPlacement } from "@/lib/server/placement-repo";
import { responsesTo } from "@/lib/server/request-repo";
import { isPromoted } from "@/lib/placement/tiers";
import { getProfile } from "@/lib/server/profile-repo";
import { matchProfiles } from "@/lib/tags/match";
import type { OfferResponse, PublishedRequest } from "./types";

/** Через скільки секунд після публікації приходить кожен наступний відгук. */
const ARRIVALS = [5, 12, 20, 32, 48, 70, 95];

/** Діапазон цін за групою спеціаліста, гривні. */
const PRICE: Record<string, [number, number]> = {
  design: [4000, 18000],
  web: [12000, 60000],
  mobile: [35000, 120000],
  automation: [6000, 25000],
  business: [18000, 60000],
  backend: [20000, 70000],
};

const MESSAGES: Record<string, string[]> = {
  design: [
    "Добрий день! Запит зрозумілий: зроблю кілька варіантів на вибір, правки до затвердження входять у ціну.",
    "Вітаю! Маю схожі роботи в портфоліо, покажу в чаті. Перші ескізи — за 2 дні.",
  ],
  web: [
    "Добрий день! Зроблю на Next.js, адаптивно під телефон, з адмінкою для контенту. Можу почати завтра.",
    "Вітаю! Схожий проєкт є в портфоліо, покажу. Спершу коротко уточню структуру сторінок.",
  ],
  mobile: [
    "Добрий день! Зроблю для iOS та Android одразу на Flutter, з публікацією в сторах.",
    "Вітаю! Можу показати демо схожого застосунку. Почнемо з прототипу, щоб ви одразу побачили екрани.",
  ],
  automation: [
    "Добрий день! Зберу бота й підключу до ваших таблиць. Перша робоча версія — за кілька днів.",
    "Вітаю! Такі сценарії роблю регулярно, у ціну входить місяць підтримки після запуску.",
  ],
  business: [
    "Добрий день! Налаштую під ваші процеси, спершу 30 хвилин дзвінка, щоб зрозуміти, як ви працюєте зараз.",
  ],
  backend: [
    "Добрий день! Зроблю бекенд з API й кабінетом адміністратора, задеплою на ваш домен.",
  ],
};

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 2 ** 32;
};

/** Усі відгуки, які прийдуть на запит, з часом появи. */
const plannedResponses = (request: PublishedRequest): OfferResponse[] => {
  const matched = matchProfiles(request.tags.map((tag) => tag.id), DEMO_PERFORMERS);
  const pool = matched?.size ? DEMO_PERFORMERS.filter((performer) => matched.has(performer.id)) : DEMO_PERFORMERS;
  const chosen = [...pool].sort((a, b) => hash(`${request.id}:${a.id}`) - hash(`${request.id}:${b.id}`)).slice(0, ARRIVALS.length);
  const start = Date.parse(request.createdAt);
  return chosen.map((performer, index) => {
    const salt = `${request.id}:${performer.id}`;
    const group = primaryGroup(performer.tags) ?? "web";
    const [low, high] = PRICE[group] ?? PRICE.web;
    const price = hash(`${salt}:open`) < 0.2 ? null : Math.round((low + hash(`${salt}:price`) * (high - low)) / 500) * 500;
    const messages = MESSAGES[group] ?? MESSAGES.web;
    return {
      id: `resp_${request.id}_${index}`,
      requestId: request.id,
      performerId: performer.id,
      name: performer.name,
      specialty: performer.specialty,
      cityName: CITIES.find((city) => city.id === performer.cityId)?.name ?? "",
      avatarIndex: performer.avatarIndex,
      tier: performer.tier,
      promoted: isPromoted(performer.tier),
      rating: (4.6 + hash(`${salt}:rating`) * 0.4).toFixed(1),
      price,
      days: 3 + Math.floor(hash(`${salt}:days`) * 25),
      message: messages[Math.floor(hash(`${salt}:message`) * messages.length)],
      createdAt: new Date(start + ARRIVALS[index] * 1000).toISOString(),
    };
  });
};

/**
 * Відгуки, що вже прийшли. Порядок — за оплатою розміщення (вищий рівень
 * вище), серед рівних — хто відповів раніше.
 */
export const responsesFor = async (request: PublishedRequest, now = Date.now()): Promise<OfferResponse[]> =>
  request.status === "open"
    ? [...plannedResponses(request).filter((response) => Date.parse(response.createdAt) <= now), ...(await realResponses(request))].sort(
        (a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt)
      )
    : [];

/** Відгуки справжніх виконавців (інших акаунтів) на запит; рівень — за їхньою оплатою розміщення. */
const realResponses = async (request: PublishedRequest): Promise<OfferResponse[]> =>
  (await Promise.all(
    (await responsesTo(request.id)).map(async ({ userId, response }) => {
    const profile = await getProfile(userId);
    if (!profile?.published) return [];
    const placement = await getPlacement(userId);
    return [
      {
        id: `resp_${request.id}_${userId}`,
        requestId: request.id,
        performerId: `me-${userId}`,
        name: profile.name,
        specialty: profile.specialty,
        cityName: CITIES.find((city) => city.id === profile.cityId)?.name ?? "",
        avatarIndex: 0,
        photo: profile.photo || undefined,
        tier: placement.tier,
        promoted: isPromoted(placement.tier),
        rating: "—",
        price: response.price,
        days: response.days,
        message: response.message,
        createdAt: response.createdAt,
      },
    ];
  }),
  )).flat();
