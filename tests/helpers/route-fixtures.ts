// tests/helpers/route-fixtures.ts
//
// Заготовки для тестів маршрутів: опублікований профіль, запит, запит до маршруту з JSON.

import { emptyProfile } from "@/lib/profile/types";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest } from "@/lib/server/request-repo";
import { overLimit, RATE_RULES, type RateName } from "@/lib/server/rate-limit";

export const publishProfile = async (userId: string, over: { name?: string; published?: boolean } = {}) =>
  saveProfile(userId, {
    ...emptyProfile(over.name ?? `Виконавець ${userId}`),
    cityId: "lviv",
    specialty: "Розробник",
    bio: "Роблю сайти.",
    tags: ["telegram-bot", "n8n"],
    photo: `/api/uploads/photos/${userId}/x.jpg`,
    published: over.published ?? true,
  });

export const openRequest = async (userId: string, text = "Потрібен Telegram-бот для запису клієнтів") =>
  createRequest(userId, { text, budget: null, deadline: null, cityId: null, tags: [], files: [] });

/** Сам виписує ліміт правила для користувача, щоб наступне звернення дало 429. Рахунок іде тією ж функцією, що й маршрут. */
export const exhaust = async (name: RateName, subject: string) => {
  for (let index = 0; index < RATE_RULES[name].max; index++) await overLimit(name, subject);
};

export const jsonRequest = (method: string, body: unknown, url = "https://findlyfy.test/api/x") =>
  new Request(url, { method, body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } });

export const ctxOf = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
