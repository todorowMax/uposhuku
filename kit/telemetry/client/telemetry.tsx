"use client";

// kit/telemetry/client/telemetry.tsx
//
// Усе клієнтське в одному компоненті: помилки, перегляди сторінок і
// аналітика. Кладеться один раз у кореневий layout.
//
//   <Telemetry userId={user?.id ?? null} />

import { useEffect, useMemo } from "react";
import { identify, startAnalytics, type AnalyticsProvider } from "./analytics";
import { configureClient, type TelemetryClientConfig } from "./config";
import { ErrorReporter } from "./error-reporter";
import { syncInternalTraffic } from "./internal";
import { PageViews } from "./page-views";
import { ownProvider } from "./providers/own";

export interface TelemetryProps extends Partial<TelemetryClientConfig> {
  /** Хто увійшов; для інших провайдерів. Свій сервер це знає із сесії. */
  userId?: string | null;
  /** Додаткові провайдери поруч зі своїм (Amplitude, PostHog). */
  extraProviders?: AnalyticsProvider[];
  /** Шум, який не слати: рядок або регулярний вираз за текстом помилки. */
  ignoreErrors?: (string | RegExp)[];
}

export function Telemetry({ userId = null, extraProviders, ignoreErrors, reportUrl, ingestUrl, storagePrefix }: TelemetryProps) {
  const config = useMemo(() => ({ reportUrl, ingestUrl, storagePrefix }), [reportUrl, ingestUrl, storagePrefix]);

  useEffect(() => {
    configureClient(Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)));
    // Позначку читаємо до запуску: інакше перша пачка піде без неї, і перший візит потрапив би в статистику як чужий.
    syncInternalTraffic(window.location.search);
    startAnalytics([ownProvider(), ...(extraProviders ?? [])]);
    // Провайдери задаються один раз за життя сторінки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => {
    identify(userId);
  }, [userId]);

  return (
    <>
      <ErrorReporter ignore={ignoreErrors} />
      <PageViews />
    </>
  );
}
