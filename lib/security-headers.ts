// lib/security-headers.ts
//
// Захисні заголовки відповідей. X-Content-Type-Options, Referrer-Policy і X-Frame-Options діють одразу.
// CSP розділено на два заголовки:
//  - Content-Security-Policy (діє): лише безпечні директиви, які не залежать від джерел скриптів і картинок:
//    frame-ancestors, object-src, base-uri, form-action;
//  - Content-Security-Policy-Report-Only: повна політика з script-src тощо, нічого не блокує, порушення йдуть
//    у /api/csp-report. `script-src` лишається тут: сайт тримає 'unsafe-inline', поки Next вставляє inline-скрипти без nonce.
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
//  - Turnstile на вході (components/auth/use-turnstile.ts): скрипт, iframe і запити з challenges.cloudflare.com
//    (script-src, frame-src, connect-src);
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

/** Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/reference/content-security-policy/. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Директиви, які діють одразу: не залежать від переліку скриптів, картинок і мережі, тож не можуть зламати карту чи оплату. */
const ENFORCED_DIRECTIVES: Record<string, string[]> = {
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

const serialize = (directives: Record<string, string[]>): string => [...Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`), `report-uri ${CSP_REPORT_PATH}`].join("; ");

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

/** Директиви, що діють одразу, як рядок заголовка Content-Security-Policy. */
export const enforcedPolicy = (): string => serialize(ENFORCED_DIRECTIVES);

/** Повна політика як рядок для Report-Only. У режимі розробки React потребує eval для зневадження. */
export const contentSecurityPolicy = (options: HeaderOptions = {}): string => {
  const rpc = rpcOrigin(options.rpcUrl);
  const scripts = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", TURNSTILE_ORIGIN, ...(options.dev ? ["'unsafe-eval'"] : [])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scripts,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "blob:", "data:", ...MAP_ORIGINS, TURNSTILE_ORIGIN, "wss:", ...WALLETCONNECT_ORIGINS, ...(rpc ? [rpc] : []), ...(options.dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": ["'self'", TURNSTILE_ORIGIN],
    // object-src, base-uri, form-action і frame-ancestors діють окремим заголовком (ENFORCED_DIRECTIVES): тут їх не дублюємо.
  };
  return serialize(directives);
};

/** Заголовки для кожної відповіді. */
export const securityHeaders = (options: HeaderOptions = {}): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": enforcedPolicy(),
  "Content-Security-Policy-Report-Only": contentSecurityPolicy(options),
});
