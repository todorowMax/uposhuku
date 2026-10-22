// instrumentation.ts
//
// Next викликає `onRequestError` для кожної помилки під час обробки запиту:
// падіння сторінки на сервері (render), у route handler, в серверній дії.
// Без цього помилка рендеру видна лише в `wrangler tail`. Записуємо в журнал
// kit разом з `digest`: за ним зв'язується запис із екраном «Щось зламалося»
// в браузері (там digest теж іде у звіті).

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string }
) {
  try {
    const { logServer } = await import("@/lib/telemetry/log");
    const err = error instanceof Error ? error : new Error(String(error));
    logServer({
      level: "error",
      event: context.routeType === "render" ? "server_render_error" : "server_request_error",
      message: err.message,
      detail: {
        name: err.name,
        stack: err.stack ?? null,
        digest: (err as { digest?: string }).digest ?? null,
        method: request.method,
        path: request.path.split("?")[0],
        routePath: context.routePath ?? null,
        routeType: context.routeType ?? null,
        renderSource: context.renderSource ?? null,
      },
    });
  } catch {
    // Журнал не має ламати обробку помилки.
  }
}
