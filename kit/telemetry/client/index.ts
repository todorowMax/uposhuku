// kit/telemetry/client: усе, що працює в браузері.
export { Telemetry, type TelemetryProps } from "./telemetry";
export { configureClient, type TelemetryClientConfig } from "./config";
export { ErrorReporter } from "./error-reporter";
export { PageViews } from "./page-views";
export { reportError, type ReportInput } from "./report-error";
export { addBreadcrumb, getBreadcrumbs, type Breadcrumb } from "./breadcrumbs";
export { identify, startAnalytics, track, trackPage, analyticsProviderIds, type AnalyticsEvent, type AnalyticsProvider, type EventProps } from "./analytics";
export { ownProvider } from "./providers/own";
export { noopProvider } from "./providers/noop";
export { CONSENT_CHANGED, getConsent, gpcEnabled, onConsentChange, readStoredConsent, shouldAskConsent, writeConsent, type Consent } from "./consent";
export { isInternalTraffic, syncInternalTraffic } from "./internal";
