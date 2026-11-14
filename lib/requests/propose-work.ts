// lib/requests/propose-work.ts
//
// «Запропонувати роботу» на картці виконавця. Є відкритий запит: пропонуємо угоду цьому виконавцю (чат
// з ним і той самий екран, що в рядку угоди). Немає: розгортаємо поле запиту з підказкою; запит до виконавця не привʼязується, його пропонують після публікації.

import { createStore } from "@/lib/store";
import type { PublishedRequest } from "./types";

export type ProposeWorkAction = "deal" | "compose";

export const proposeWorkAction = ({ signedIn, requests }: { signedIn: boolean; requests: Pick<PublishedRequest, "status">[] | null }): ProposeWorkAction =>
  signedIn && requests?.some((request) => request.status === "open") ? "deal" : "compose";

/** Підказка в розкритому полі: чесно каже, що запит публікується як звичайний, а виконавцю його пропонують потім. */
export const proposeTaskLabel = (name: string) => `Опишіть задачу. Після публікації запропонуйте її: ${name}`;

/** Для кого людина зараз пише задачу в полі запиту; null — ні для кого. Поле розгортається, коли сюди щось кладуть. */
export const proposeTargetStore = createStore<{ name: string } | null>(null);

/** Виконавець (id виду me-…), якому відкрита розмова має одразу показати «Запропонувати угоду». Розмова забирає це, коли готова. */
export const proposeDealIntentStore = createStore<string | null>(null);
