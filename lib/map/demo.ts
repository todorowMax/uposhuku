// lib/map/demo.ts
//
// Демо-наповнення карти, поки немає бекенду: скільки виконавців у якому
// місті, кілька запитів і один свіжий запит зі Львова, як у макеті.
// Усе детерміновано, щоб сервер і клієнт малювали те саме.

import { CITIES, cityById } from "./cities";
import { inUkraine } from "./geo";
import { placeNear, scatterAround } from "./scatter";
import type { Match, Performer, WorkRequest } from "./types";

const PERFORMERS_PER_CITY: Record<string, number> = {
  kyiv: 24,
  lviv: 11,
  kharkiv: 8,
  dnipro: 6,
  odesa: 9,
  zaporizhzhia: 2,
  vinnytsia: 2,
  ternopil: 2,
  "ivano-frankivsk": 2,
  mykolaiv: 2,
};

/** Крок спіралі, км: на масштабі країни купка міста читається однією плямою. */
const SPACING_KM = 15;

/** Вигадані люди для візуальної демонстрації, не профілі користувачів. */
const MOCK_PROFILES = [
  ["Олена Ковальчук", "UI/UX дизайнерка"],
  ["Максим Бондар", "Full-stack розробник"],
  ["Анна Мельник", "Продуктова дизайнерка"],
  ["Данило Савченко", "Розробник застосунків"],
  ["Артем Романюк", "Front-end розробник"],
  ["Марія Шевченко", "Дизайнерка інтерфейсів"],
  ["Ігор Петренко", "Розробник CRM"],
  ["Софія Ткаченко", "No-code спеціалістка"],
  ["Юлія Мороз", "Продуктова дизайнерка"],
  ["Богдан Левченко", "Full-stack розробник"],
  ["Катерина Павленко", "Web-дизайнерка"],
  ["Олексій Гриценко", "Інженер автоматизації"],
  ["Тарас Кравчук", "Front-end розробник"],
  ["Наталія Дорошенко", "UI/UX дизайнерка"],
  ["Сергій Коваль", "Розробник сервісів"],
  ["Вікторія Литвин", "Дизайнерка продуктів"],
] as const;

/** Стабільний хеш рядка в [0, 1): «онлайн» не має мигати між рендерами. */
const unitHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
};

export const DEMO_PERFORMERS: Performer[] = CITIES.flatMap((city, cityIndex) => {
  const count = PERFORMERS_PER_CITY[city.id] ?? 1;
  return scatterAround(city, count, SPACING_KM, inUkraine).map((point, i) => {
    const id = `${city.id}-${i}`;
    const avatarIndex = (cityIndex * 5 + i * 3) % MOCK_PROFILES.length;
    const [name, specialty] = MOCK_PROFILES[avatarIndex];
    const placement = i % 9 === 0 ? "featured" : i % 3 === 0 ? "plus" : "standard";
    return {
      id,
      cityId: city.id,
      ...point,
      online: unitHash(id) < 0.4,
      placement,
      avatarIndex,
      name,
      specialty,
    };
  });
});

/**
 * Запит ставимо на захід від центру міста: знизу й праворуч стоїть
 * підпис, а крапка поверх нього читалася б як частина слова. Теж лише
 * на суходолі.
 */
const request = (cityId: string, live = false): WorkRequest => {
  const city = cityById(cityId);
  const point = placeNear(city, SPACING_KM * 2.2, 180, inUkraine);
  return { id: `request-${cityId}`, cityId, live, ...point };
};

export const DEMO_REQUESTS: WorkRequest[] = [
  request("lviv", true),
  request("kyiv"),
  request("kharkiv"),
  request("dnipro"),
  request("odesa"),
  request("vinnytsia"),
  request("poltava"),
];

/** Кого підібрали під свіжий львівський запит. */
export const DEMO_MATCHES: Match[] = [
  "lviv-2",
  "lviv-5",
  "lutsk-0",
  "rivne-0",
  "ternopil-1",
  "khmelnytskyi-0",
  "kyiv-3",
].map((performerId) => ({ requestId: "request-lviv", performerId }));
