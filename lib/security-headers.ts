// lib/security-headers.ts
//
// Захисні заголовки відповідей. X-Content-Type-Options, Referrer-Policy і X-Frame-Options діють одразу.
// Content-Security-Policy поки лише Report-Only: порушення йдуть у /api/csp-report, нічого не блокується.
// HSTS не ставимо: це налаштування зони Cloudflare у власника.
//
// Джерела CSP зібрано з коду:
//  - карта (lib/maplibre/style.ts): векторні тайли tiles.openfreemap.org і рельєф s3.amazonaws.com (fetch у воркері
//    MapLibre, тож connect-src), воркер /maplibre/maplibre-gl-worker.mjs зі свого походження (worker-src 'self' blob:);
//  - шрифти карти й сайту: свої файли (/fonts), `font-src 'self' data:`;
//  - зображення: свої, data: (фото профілів), blob: (перегляд перед завантаженням, канвас карти) і https:;
//  - WebSocket чату: той самий хост (wss:/ws:);
//  - heic-to (WASM у браузері): 'wasm-unsafe-eval'; Next вставляє inline-скрипти без nonce: 'unsafe-inline'.

export const CSP_REPORT_PATH = "/api/csp-report";

export const MAP_ORIGINS: readonly string[] = ["https://tiles.openfreemap.org", "https://s3.amazonaws.com"];

/** Політика як рядок. У режимі розробки React потребує eval для зневадження. */
export const contentSecurityPolicy = (options: { dev?: boolean } = {}): string => {
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(options.dev ? ["'unsafe-eval'"] : [])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scripts,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "blob:", "data:", ...MAP_ORIGINS, "wss:", ...(options.dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const body = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  return [...body, `report-uri ${CSP_REPORT_PATH}`].join("; ");
};

/** Заголовки для кожної відповіді. */
export const securityHeaders = (options: { dev?: boolean } = {}): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy-Report-Only": contentSecurityPolicy(options),
});
