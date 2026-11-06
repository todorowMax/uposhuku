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
//  - гаманці (WalletConnect, components/wallet): реле wss:, перевірка dapp і RPC-проксі за адресами нижче; RPC мережі
//    оплат з CRYPTO_RPC_URL (origin) додається, якщо задано: браузер читає мережу через гаманець, але пакет може
//    звернутися до вузла напряму;
//  - WebSocket чату: той самий хост (wss:/ws:);
//  - heic-to (WASM у браузері): 'wasm-unsafe-eval'; Next вставляє inline-скрипти без nonce: 'unsafe-inline'.

export const CSP_REPORT_PATH = "/api/csp-report";

export const MAP_ORIGINS: readonly string[] = ["https://tiles.openfreemap.org", "https://s3.amazonaws.com"];

/** Адреси WalletConnect, до яких звертається @walletconnect/ethereum-provider (реле йде через `wss:`). */
export const WALLETCONNECT_ORIGINS: readonly string[] = [
  "https://relay.walletconnect.org",
  "https://relay.walletconnect.com",
  "https://rpc.walletconnect.org",
  "https://rpc.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://verify.walletconnect.com",
  "https://pulse.walletconnect.org",
  "wss://relay.walletconnect.org",
  "wss://relay.walletconnect.com",
];

/** Origin RPC з налаштувань оплат або null, якщо не задано чи адреса некоректна. */
export const rpcOrigin = (rpcUrl: string | undefined): string | null => {
  try {
    const url = new URL(rpcUrl?.trim() ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
};

export interface HeaderOptions {
  dev?: boolean;
  /** CRYPTO_RPC_URL: його origin потрапляє в connect-src. */
  rpcUrl?: string;
}

/** Політика як рядок. У режимі розробки React потребує eval для зневадження. */
export const contentSecurityPolicy = (options: HeaderOptions = {}): string => {
  const rpc = rpcOrigin(options.rpcUrl);
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(options.dev ? ["'unsafe-eval'"] : [])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scripts,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "blob:", "data:", ...MAP_ORIGINS, "wss:", ...WALLETCONNECT_ORIGINS, ...(rpc ? [rpc] : []), ...(options.dev ? ["ws:"] : [])],
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
export const securityHeaders = (options: HeaderOptions = {}): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy-Report-Only": contentSecurityPolicy(options),
});
