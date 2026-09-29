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
 * Вигадані люди для візуальної демонстрації, не профілі користувачів.
 * Теги — з lib/tags, щоб фільтр карти за запитом мав на чому працювати.
 */
const MOCK_PROFILES: readonly (readonly [string, string, readonly string[]])[] = [
  ["Олена Ковальчук", "UI/UX дизайнерка", ["ui-ux-design", "figma", "redesign", "website", "mobile-app"]],
  ["Максим Бондар", "Full-stack розробник", ["web-app", "website", "api-backend", "nextjs", "saas", "online-store"]],
  ["Анна Мельник", "Продуктова дизайнерка", ["ui-ux-design", "ux-research", "mobile-app", "figma", "planner-app"]],
  ["Данило Савченко", "Розробник застосунків", ["mobile-app", "ios-app", "android-app", "flutter", "planner-app", "fitness-app"]],
  ["Артем Романюк", "Front-end розробник", ["website", "landing", "react", "nextjs", "web-app"]],
  ["Марія Шевченко", "Дизайнерка інтерфейсів", ["ui-ux-design", "web-app", "figma", "landing"]],
  ["Ігор Петренко", "Розробник CRM", ["crm", "crm-setup", "automation", "admin-panel", "dashboard"]],
  ["Софія Ткаченко", "No-code спеціалістка", ["automation", "lovable", "landing", "n8n", "bubble", "telegram-bot"]],
  ["Юлія Мороз", "Продуктова дизайнерка", ["ui-ux-design", "mobile-app", "branding", "ux-research"]],
  ["Богдан Левченко", "Full-stack розробник", ["web-app", "api-backend", "saas", "mobile-app", "react-native"]],
  ["Катерина Павленко", "Web-дизайнерка", ["website", "landing", "tilda", "ui-ux-design", "online-store"]],
  ["Олексій Гриценко", "Інженер автоматизації", ["automation", "telegram-bot", "chat-bot", "n8n", "parser", "integration-service"]],
  ["Тарас Кравчук", "Front-end розробник", ["website", "react", "web-app", "pwa", "online-store"]],
  ["Наталія Дорошенко", "UI/UX дизайнерка", ["ui-ux-design", "figma", "mobile-app", "redesign"]],
  ["Сергій Коваль", "Розробник сервісів", ["api-backend", "saas", "telegram-bot", "online-store", "booking-platform"]],
  ["Вікторія Литвин", "Дизайнерка продуктів", ["ui-ux-design", "branding", "mobile-app", "website"]],
];

/** «Про себе» для демо-профілів, у порядку MOCK_PROFILES. Різної довжини, щоб видно було «Розгорнути». */
const MOCK_BIOS = [
  "Проєктую інтерфейси, якими зручно користуватися з першого разу. Починаю з розмови з вашими клієнтами, далі прототип у Figma, тести на живих людях і макети, які розробник збере без питань. Працювала з клініками, школами й сервісами доставки.",
  "Беру ідею від чернетки до запущеного продукту: бекенд, фронтенд, оплата, деплой. Люблю Next.js і акуратні бази даних.",
  "Продуктова дизайнерка з досвідом у мобільних застосунках. Допомагаю зрозуміти, що саме потрібно людям, і прибрати зайве. Роблю UX-дослідження, карту шляху користувача й інтерактивний прототип, який можна показати інвесторам або першим клієнтам ще до розробки. Після запуску дивлюся на аналітику й пропоную, що покращити.",
  "Роблю застосунки для iOS та Android на Flutter. Від першого екрана до публікації в сторах: авторизація, оплата, сповіщення, офлайн-режим.",
  "Верстаю швидкі й охайні сайти на React. Дбаю про те, щоб усе відкривалося миттєво на телефоні й добре читалося пошуковиками.",
  "Малюю інтерфейси для веб-сервісів і лендингів. Мені важливо, щоб дизайн не лише гарно виглядав, а й продавав: чіткі заголовки, зрозумілі кнопки, жодного зайвого кроку до заявки.",
  "Налаштовую й дописую CRM під реальні процеси бізнесу: заявки з сайту, воронки, нагадування менеджерам, звіти для власника. Якщо готова CRM не підходить, збираю свою адмінку.",
  "Збираю робочі рішення без програмування: сайти на Lovable і Bubble, автоматизації в n8n, Telegram-боти. Швидко й недорого, щоб ви перевірили ідею до великих вкладень.",
  "Допомагаю продуктам виглядати цілісно: від логотипу до мобільного застосунку. Роблю дизайн-системи, щоб команда далі рухалася швидко й без хаосу в макетах.",
  "Full-stack розробник. Пишу бекенд і мобільні застосунки на React Native, налаштовую сервери й CI. Доводжу до ладу проєкти, згенеровані ШІ: прибираю помилки, додаю тести, готую до реальних користувачів.",
  "Роблю сайти на Tilda й інтернет-магазини під ключ: структура, дизайн, тексти, підключення оплати й доставки.",
  "Автоматизую рутину: боти, інтеграції між сервісами, парсери. Якщо ваші менеджери щодня копіюють дані з однієї таблиці в іншу — це до мене. Працюю з n8n, Python і API більшості українських сервісів: Нова Пошта, Monobank, Checkbox, Хорошоп.",
  "Front-end розробник. PWA, інтернет-магазини, складні форми. Люблю, коли інтерфейс швидкий і не ламається.",
  "UI/UX дизайнерка. Редизайн застарілих інтерфейсів — моя улюблена задача: знаходжу, де люди губляться, і роблю так, щоб не губилися.",
  "Розробляю сервіси й Telegram-боти з онлайн-записом, оплатою та кабінетом для адміністратора. Запускав системи бронювання для студій, салонів і коворкінгів.",
  "Дизайнерка продуктів: брендинг, сайти, мобільні застосунки. Роблю так, щоб бренд впізнавався з першого екрана.",
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
 * Скільки людей на якому рівні розміщення: більшість на базовому,
 * найбільший портрет — рідкість, як і буде з платним просуванням.
 */
const TIER_SHARE: [PlacementTier, number][] = [[1, 0.4], [2, 0.62], [3, 0.77], [4, 0.88], [5, 0.95], [6, 1]];

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
    const [name, specialty, skills] = MOCK_PROFILES[avatarIndex];
    const share = unitHash(`${id}:tier`);
    const tier = TIER_SHARE.find(([, upTo]) => share < upTo)?.[0] ?? 1;
    const industry = Math.floor(unitHash(`${id}:industry`) * DEMO_INDUSTRIES.length);
    const industries = [DEMO_INDUSTRIES[industry], DEMO_INDUSTRIES[(industry + 5) % DEMO_INDUSTRIES.length]];
    return {
      id,
      cityId: city.id,
      ...point,
      online: unitHash(id) < 0.4,
      tier,
      tags: [...skills, ...industries],
      bio: MOCK_BIOS[avatarIndex],
      works: demoWorks(id, skills),
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
