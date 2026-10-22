// kit/telemetry/core/ua.ts
//
// Пристрій, браузер і ОС з User-Agent простими регулярними виразами, без
// бібліотек: нам потрібні грубі розрізи («телефон чи комп'ютер»), а не версії.

export interface UaInfo {
  device: "mobile" | "tablet" | "desktop";
  browser: string;
  os: string;
  bot: boolean;
}

const BOT = /bot|crawler|spider|crawling|headless|lighthouse|pagespeed|preview|facebookexternalhit|slurp|bingpreview|whatsapp|telegrambot|monitor|uptime|curl\/|wget\/|python-requests|go-http-client/i;

export const parseUserAgent = (userAgent: string | null | undefined): UaInfo => {
  const ua = userAgent ?? "";
  const bot = !ua || BOT.test(ua);

  const os = /windows/i.test(ua) ? "Windows" : /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /mac os x|macintosh/i.test(ua) ? "macOS" : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : "Other";

  // Порядок важливий: Edge і Opera містять «Chrome», Chrome містить «Safari».
  const browser = /edg(e|a|ios)?\//i.test(ua)
    ? "Edge"
    : /opr\/|opera/i.test(ua)
      ? "Opera"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /samsungbrowser/i.test(ua)
          ? "Samsung"
          : /chrome|crios/i.test(ua)
            ? "Chrome"
            : /safari/i.test(ua)
              ? "Safari"
              : "Other";

  const tablet = /ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  const mobile = /mobi|iphone|ipod|android/i.test(ua);
  return { device: tablet ? "tablet" : mobile ? "mobile" : "desktop", browser, os, bot };
};
