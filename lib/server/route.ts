// lib/server/route.ts
import type { z } from "zod";
import { problem } from "@/lib/api/problem";
import type { SessionUser } from "@/lib/auth/types";
import { logServerError } from "@/lib/telemetry/log";
import { getAdmin } from "./admin";
import { AuthError, getSessionUser } from "./auth";
import { rateLimited, type RateName } from "./rate-limit";

/** Помилки входу відповідаємо як problem+json; усе інше — 500 без подробиць назовні й із записом у журнал. */
export const failure = (error: unknown, request?: Request) => {
  if (error instanceof AuthError) return problem(error.status, error.title, error.detail, error.type);
  console.error(error);
  logServerError(error, request);
  return problem(500, "Щось пішло не так", "Спробуйте ще раз трохи згодом.");
};

/** IP клієнта для лімітів: за Cloudflare це cf-connecting-ip. */
export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

type RouteAuth = "user" | "admin" | "none";

export interface RouteOptions<A extends RouteAuth, S extends z.ZodType | undefined> {
  /** `user`: без сесії 401; `admin`: не адміністратор дає 404 (як в адмінці); `none`: сесію не читаємо. */
  auth?: A;
  /** Правило частоти: ключ це користувач, а без входу IP клієнта. */
  rate?: RateName;
  /** zod-схема тіла JSON: зламаний JSON чи помилка поля дає 400 problem+json зі списком `errors`. */
  body?: S;
  /** Власна відповідь 401, якщо маршрут уже віддає інший текст чи форму. */
  unauthorized?: () => Response;
}

export interface RouteArgs<A extends RouteAuth, S extends z.ZodType | undefined, P> {
  request: Request;
  user: A extends "none" ? null : SessionUser;
  body: S extends z.ZodType ? z.infer<S> : undefined;
  params: P;
}

interface NextContext<P> {
  params?: Promise<P>;
}

const invalidBody = (detail: string, errors: { path: string; message: string }[]) =>
  new Response(JSON.stringify({ type: "about:blank", title: "Некоректний запит", status: 400, detail, errors }), {
    status: 400,
    headers: { "content-type": "application/problem+json" },
  });

const resolveUser = async (auth: RouteAuth): Promise<SessionUser | null> => {
  if (auth === "user") return getSessionUser();
  if (auth === "admin") return getAdmin();
  return null;
};

const parseBody = async (request: Request, schema: z.ZodType): Promise<{ data: unknown } | { response: Response }> => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: invalidBody("Тіло запиту має бути коректним JSON.", []) };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { data: parsed.data };
  const errors = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  return { response: invalidBody("Перевірте поля запиту.", errors) };
};

/**
 * Обгортка маршруту API: сесія (401), ліміт частоти (429), розбір тіла через zod (400), а будь-яка помилка
 * обробника іде через `failure()`, тож потрапляє в журнал. Обробник отримує вже перевіреного користувача й тіло.
 */
export const route =
  <A extends RouteAuth = "none", S extends z.ZodType | undefined = undefined, P = Record<string, never>>(
    options: RouteOptions<A, S>,
    handler: (args: RouteArgs<A, S, P>) => Promise<Response> | Response,
  ) =>
  // Запит за замовчуванням: маршрути без тіла (`GET()`) викликають без аргументів, як було до обгортки.
  async (request: Request = new Request("http://localhost/"), context?: NextContext<P>): Promise<Response> => {
    try {
      const auth = options.auth ?? "none";
      const user = await resolveUser(auth);
      if (auth !== "none" && !user) {
        if (auth === "admin") return problem(404, "Не знайдено");
        return options.unauthorized ? options.unauthorized() : problem(401, "Потрібен вхід");
      }
      if (options.rate) {
        const limited = await rateLimited(options.rate, user?.id ?? clientIp(request));
        if (limited) return limited;
      }
      let body: unknown;
      if (options.body) {
        const parsed = await parseBody(request, options.body);
        if ("response" in parsed) return parsed.response;
        body = parsed.data;
      }
      const params = (context?.params ? await context.params : {}) as P;
      return await handler({ request, user, body, params } as RouteArgs<A, S, P>);
    } catch (error) {
      return failure(error, request);
    }
  };
