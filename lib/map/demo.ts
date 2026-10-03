// lib/map/demo.ts
//
// Демо-наповнення карти, поки немає бекенду: скільки виконавців у якому
// місті, кілька запитів і один свіжий запит зі Львова, як у макеті.
// Усе детерміновано, щоб сервер і клієнт малювали те саме.

import { CITIES, cityById } from "./cities";
import { inUkraine } from "./geo";
import { placeNear, scatterAround } from "./scatter";
import type { Match, Performer, PlacementTier, PortfolioWork, WorkKind, WorkRequest } from "./types";

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

/**
 * Вигадані люди для візуальної демонстрації, не профілі користувачів:
 * імена в порядку облич в атласі (public/map/mock-avatars.png) і рід,
 * щоб спеціальність звучала правильно.
 */
const MOCK_PEOPLE: readonly (readonly [string, "f" | "m"])[] = [
  ["Олена Ковальчук", "f"], ["Максим Бондар", "m"], ["Анна Мельник", "f"], ["Данило Савченко", "m"],
  ["Артем Романюк", "m"], ["Марія Шевченко", "f"], ["Ігор Петренко", "m"], ["Софія Ткаченко", "f"],
  ["Юлія Мороз", "f"], ["Богдан Левченко", "m"], ["Катерина Павленко", "f"], ["Олексій Гриценко", "m"],
  ["Тарас Кравчук", "m"], ["Наталія Дорошенко", "f"], ["Сергій Коваль", "m"], ["Вікторія Литвин", "f"],
];

interface MockSpecialty {
  /** Група фільтра, lib/map/groups.ts. Перший тег навичок має бути з неї. */
  group: string;
  title: { m: string; f: string };
  skills: string[];
  /** «Про себе» без роду: пасує і їй, і йому. Різної довжини, щоб видно було «Розгорнути». */
  bio: string;
}

/** Спеціальності з навичками (теги з lib/tags) і описом. */
const MOCK_SPECIALTIES: MockSpecialty[] = [
  {
    group: "design",
    title: { m: "UI/UX дизайнер", f: "UI/UX дизайнерка" },
    skills: ["ui-ux-design", "figma", "redesign", "website"],
    bio: "Проєктую інтерфейси, якими зручно користуватися з першого разу. Починаю з розмови з вашими клієнтами, далі прототип у Figma, тести на живих людях і макети, які розробник збере без питань. Серед клієнтів — клініки, школи й сервіси доставки.",
  },
  {
    group: "design",
    title: { m: "Продуктовий дизайнер", f: "Продуктова дизайнерка" },
    skills: ["ui-ux-design", "ux-research", "mobile-app", "figma"],
    bio: "Допомагаю зрозуміти, що саме потрібно людям, і прибрати зайве. Роблю UX-дослідження, карту шляху користувача й інтерактивний прототип, який можна показати інвесторам або першим клієнтам ще до розробки. Після запуску дивлюся на аналітику й пропоную, що покращити.",
  },
  {
    group: "design",
    title: { m: "Дизайнер інтерфейсів", f: "Дизайнерка інтерфейсів" },
    skills: ["ui-ux-design", "web-app", "figma", "landing"],
    bio: "Малюю інтерфейси для веб-сервісів і лендингів. Мені важливо, щоб дизайн не лише гарно виглядав, а й продавав: чіткі заголовки, зрозумілі кнопки, жодного зайвого кроку до заявки.",
  },
  {
    group: "design",
    title: { m: "Дизайнер продуктів", f: "Дизайнерка продуктів" },
    skills: ["branding", "ui-ux-design", "website"],
    bio: "Брендинг, сайти, мобільні застосунки. Роблю так, щоб бренд впізнавався з першого екрана, а команда мала дизайн-систему й рухалася без хаосу в макетах.",
  },
  {
    group: "design",
    title: { m: "UI/UX дизайнер", f: "UI/UX дизайнерка" },
    skills: ["redesign", "ui-ux-design", "ux-research", "figma"],
    bio: "Редизайн застарілих інтерфейсів — моя улюблена задача: знаходжу, де люди губляться, і роблю так, щоб не губилися.",
  },
  {
    group: "web",
    title: { m: "Full-stack розробник", f: "Full-stack розробниця" },
    skills: ["web-app", "website", "api-backend", "nextjs", "saas", "online-store"],
    bio: "Беру ідею від чернетки до запущеного продукту: бекенд, фронтенд, оплата, деплой. Люблю Next.js і акуратні бази даних.",
  },
  {
    group: "web",
    title: { m: "Front-end розробник", f: "Front-end розробниця" },
    skills: ["website", "landing", "react", "nextjs", "web-app"],
    bio: "Верстаю швидкі й охайні сайти на React. Дбаю про те, щоб усе відкривалося миттєво на телефоні й добре читалося пошуковиками.",
  },
  {
    group: "web",
    title: { m: "Веб-дизайнер і верстальник", f: "Веб-дизайнерка й верстальниця" },
    skills: ["website", "landing", "tilda", "online-store"],
    bio: "Роблю сайти на Tilda й інтернет-магазини під ключ: структура, дизайн, тексти, підключення оплати й доставки.",
  },
  {
    group: "web",
    title: { m: "Front-end розробник", f: "Front-end розробниця" },
    skills: ["online-store", "react", "web-app", "pwa", "website"],
    bio: "PWA, інтернет-магазини, складні форми. Люблю, коли інтерфейс швидкий і не ламається.",
  },
  {
    group: "mobile",
    title: { m: "Розробник застосунків", f: "Розробниця застосунків" },
    skills: ["mobile-app", "ios-app", "android-app", "flutter", "planner-app", "fitness-app"],
    bio: "Роблю застосунки для iOS та Android на Flutter. Від першого екрана до публікації в сторах: авторизація, оплата, сповіщення, офлайн-режим.",
  },
  {
    group: "mobile",
    title: { m: "Мобільний розробник", f: "Мобільна розробниця" },
    skills: ["react-native", "mobile-app", "api-backend", "web-app"],
    bio: "Пишу мобільні застосунки на React Native і бекенд до них, налаштовую сервери й CI. Доводжу до ладу проєкти, згенеровані ШІ: прибираю помилки, додаю тести, готую до реальних користувачів.",
  },
  {
    group: "automation",
    title: { m: "No-code спеціаліст", f: "No-code спеціалістка" },
    skills: ["automation", "lovable", "landing", "n8n", "bubble", "telegram-bot"],
    bio: "Збираю робочі рішення без програмування: сайти на Lovable і Bubble, автоматизації в n8n, Telegram-боти. Швидко й недорого, щоб ви перевірили ідею до великих вкладень.",
  },
  {
    group: "automation",
    title: { m: "Інженер автоматизації", f: "Інженерка автоматизації" },
    skills: ["automation", "telegram-bot", "chat-bot", "n8n", "parser", "integration-service"],
    bio: "Автоматизую рутину: боти, інтеграції між сервісами, парсери. Якщо ваші менеджери щодня копіюють дані з однієї таблиці в іншу — це до мене. Працюю з n8n, Python і API більшості українських сервісів: Нова Пошта, Monobank, Checkbox, Хорошоп.",
  },
  {
    group: "business",
    title: { m: "Розробник CRM", f: "Розробниця CRM" },
    skills: ["crm", "crm-setup", "automation", "admin-panel", "dashboard"],
    bio: "Налаштовую й дописую CRM під реальні процеси бізнесу: заявки з сайту, воронки, нагадування менеджерам, звіти для власника. Якщо готова CRM не підходить, збираю свою адмінку.",
  },
  {
    group: "backend",
    title: { m: "Розробник сервісів", f: "Розробниця сервісів" },
    skills: ["api-backend", "saas", "telegram-bot", "online-store", "booking-platform"],
    bio: "Розробляю сервіси й Telegram-боти з онлайн-записом, оплатою та кабінетом для адміністратора. Уже працюють мої системи бронювання для студій, салонів і коворкінгів.",
  },
];

/**
 * Скільки людей у якій групі: одна велика (~30%), решта менші. Так
 * фільтри показують реалістичну картину, а не рівні частки.
 */
const GROUP_SHARE: [string, number][] = [
  ["design", 0.3], ["web", 0.47], ["mobile", 0.64], ["automation", 0.79], ["business", 0.9], ["backend", 1],
];

/**
 * Роботи в портфоліо за тегами профілю: кожна людина показує 3–6 проєктів
 * зі своєї спеціальності. Лише демо, справжні підуть із профілів.
 */
const WORKS_BY_TAG: Record<string, [string, WorkKind][]> = {
  "ui-ux-design": [["Кабінет пацієнта клініки", "design"], ["Дизайн-система для SaaS", "design"]],
  redesign: [["Редизайн онлайн-школи", "design"]],
  "ux-research": [["UX-аудит застосунку доставки", "design"]],
  branding: [["Айдентика пекарні", "design"], ["Стиль барбершопу", "design"]],
  website: [["Сайт стоматології", "site"], ["Сайт юридичної фірми", "site"]],
  landing: [["Лендинг курсу англійської", "site"], ["Лендинг студії манікюру", "site"]],
  "online-store": [["Магазин кераміки", "site"], ["Магазин спортхарчування", "site"]],
  "web-app": [["Бронювання переговорок", "dashboard"], ["Кабінет клієнта логістики", "dashboard"]],
  saas: [["SaaS для репетиторів", "dashboard"]],
  "mobile-app": [["Застосунок для вигулу собак", "app"], ["Трекер тренувань", "app"]],
  "ios-app": [["Доставка квітів для iOS", "app"]],
  "android-app": [["Каталог автозапчастин", "app"]],
  "planner-app": [["Планер для батьків школярів", "app"]],
  "fitness-app": [["Щоденник тренувань з таймером", "app"]],
  "react-native": [["Застосунок кав'ярні з бонусами", "app"]],
  crm: [["CRM для салону краси", "dashboard"], ["Воронка продажів для меблів", "dashboard"]],
  dashboard: [["Дашборд продажів мережі", "dashboard"]],
  "admin-panel": [["Адмінка служби доставки", "dashboard"]],
  automation: [["Заявки з сайту в Google Sheets", "bot"]],
  parser: [["Моніторинг цін конкурентів", "dashboard"]],
  "telegram-bot": [["Бот запису до барбера", "bot"], ["Бот замовлень для піцерії", "bot"]],
  "chat-bot": [["Бот підтримки магазину", "bot"]],
  "api-backend": [["API для застосунку доставки", "dashboard"]],
  "booking-platform": [["Онлайн-запис для мережі студій", "site"]],
};

const demoWorks = (id: string, skills: readonly string[]): PortfolioWork[] => {
  const pool = [...new Map(skills.flatMap((tag) => WORKS_BY_TAG[tag] ?? []).map((work) => [work[0], work])).values()];
  const count = Math.min(pool.length, 3 + Math.floor(unitHash(`${id}:works`) * 4));
  const start = Math.floor(unitHash(`${id}:first-work`) * pool.length);
  return Array.from({ length: count }, (_, index) => {
    const [title, kind] = pool[(start + index) % pool.length];
    return { id: `${id}-work-${index}`, title, kind, hue: Math.floor(unitHash(`${id}:${title}`) * 360) };
  });
};

/** Галузі, з якими людина вже працювала: одна-дві на профіль. */
const DEMO_INDUSTRIES = [
  "beauty", "restaurants", "veterinary", "medicine", "education", "ecommerce",
  "real-estate", "fitness", "logistics", "kids", "hotels", "finance",
];

/**
 * Скільки людей на якому рівні розміщення. На карті стоять лише ті, хто
 * заплатив (від рівня 2): найменший платний рівень тримає більшість,
 * найбільший портрет — рідкість.
 */
const TIER_SHARE: [PlacementTier, number][] = [[2, 0.55], [3, 0.77], [4, 0.89], [5, 0.96], [6, 1]];

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
    const avatarIndex = (cityIndex * 5 + i * 3) % MOCK_PEOPLE.length;
    const [name, gender] = MOCK_PEOPLE[avatarIndex];
    const groupRoll = unitHash(`${id}:group`);
    const group = GROUP_SHARE.find(([, upTo]) => groupRoll < upTo)?.[0] ?? "design";
    const options = MOCK_SPECIALTIES.filter((specialty) => specialty.group === group);
    const { title, skills, bio } = options[Math.floor(unitHash(`${id}:specialty`) * options.length)];
    const share = unitHash(`${id}:tier`);
    const tier = TIER_SHARE.find(([, upTo]) => share < upTo)?.[0] ?? 2;
    const industry = Math.floor(unitHash(`${id}:industry`) * DEMO_INDUSTRIES.length);
    const industries = [DEMO_INDUSTRIES[industry], DEMO_INDUSTRIES[(industry + 5) % DEMO_INDUSTRIES.length]];
    return {
      id,
      cityId: city.id,
      ...point,
      online: unitHash(id) < 0.4,
      tier,
      tags: [...skills, ...industries],
      bio,
      works: demoWorks(id, skills),
      avatarIndex,
      name,
      specialty: title[gender],
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
