// lib/requests/propose-work.ts
//
// «Запропонувати роботу» на картці виконавця. Є відкритий запит: пропонуємо угоду цьому виконавцю (чат
// з ним і той самий екран, що в рядку угоди). Немає: розгортаємо поле запиту з підписом «Задача для …».

import { createStore } from "@/lib/store";
import type { PublishedRequest } from "./types";

export type ProposeWorkAction = "deal" | "compose";

export const proposeWorkAction = ({ signedIn, requests }: { signedIn: boolean; requests: Pick<PublishedRequest, "status">[] | null }): ProposeWorkAction =>
  signedIn && requests?.some((request) => request.status === "open") ? "deal" : "compose";

export const proposeTaskLabel = (name: string) => `Задача для ${name}`;

/** Для кого людина зараз пише задачу в полі запиту; null — ні для кого. Поле розгортається, коли сюди щось кладуть. */
export const proposeTargetStore = createStore<{ name: string } | null>(null);

/** Виконавець (id виду me-…), якому відкрита розмова має одразу показати «Запропонувати угоду». Розмова забирає це, коли готова. */
export const proposeDealIntentStore = createStore<string | null>(null);
