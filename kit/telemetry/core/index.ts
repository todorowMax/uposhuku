// kit/telemetry/core: усе, що працює без React і Next: у воркері, в роуті, в тестах.
export * from "./types";
export { clip, serialize } from "./serialize";
export { fingerprint, normalizeMessage, topFrame } from "./fingerprint";
export { hashIp, sha256Hex } from "./hash";
export { DAY, HOUR, MINUTE, hit } from "./limits";
export { forgetUser, logEvent, logLater, pruneTelemetry } from "./log";
export { EVENT_NAME, insertEvents, refererDomain, sanitizeProps, trackServer } from "./events";
export { parseUserAgent, type UaInfo } from "./ua";
export { allReportQueries, dailySql, errorsSql, eventsSql, funnelSql, issueSql, sqlString } from "./reports";
