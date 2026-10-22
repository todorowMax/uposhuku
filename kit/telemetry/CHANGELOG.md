# Changelog kit/telemetry

Кожна зміна API kit: запис тут і нова версія в `VERSION`.

## 0.1.0 — 2026-10-10

Перша версія.

- **Помилки:** `logEvent`/`logLater` (ніколи не кидають), групи однакових помилок (`log_issues`, fingerprint), роут звітів із браузера з лімітами (`createReportRoute`), `ErrorReporter`, `reportError`, сліди дій (breadcrumbs).
- **Аналітика:** провайдери з чотирма методами, власний провайдер з пачками й `sendBeacon`, черга до запуску, `trackServer`, роут приймання (`createIngestRoute`), `<PageViews/>`, `?internal=1`.
- **Згода:** `granted` / `unknown` / `denied`, Global Privacy Control = відмова. До відповіді події йдуть без ідентифікатора пристрою.
- **Звіти:** SQL помилок, подій, людей за днями, воронок (`core/reports.ts`).
- **Міграції:** `0001_limits`, `0002_logs`, `0003_events` для окремої бази `TELEMETRY_DB`.
