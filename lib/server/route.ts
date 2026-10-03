// lib/server/route.ts
import { problem } from "@/lib/api/problem";
import { AuthError } from "./auth";

/** Помилки входу відповідаємо як problem+json; усе інше — 500 без подробиць назовні. */
export const failure = (error: unknown) => {
  if (error instanceof AuthError) return problem(error.status, error.title, error.detail, error.type);
  console.error(error);
  return problem(500, "Щось пішло не так", "Спробуйте ще раз трохи згодом.");
};

/** IP клієнта для лімітів: за Cloudflare це cf-connecting-ip. */
export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
