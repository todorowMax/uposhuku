"use client";

// kit/telemetry/client/report-error.ts
//
// Відправка помилки з браузера. `keepalive`, щоб запис пережив перехід на
// іншу сторінку: помилка часто трапляється якраз тоді, коли людина вже
// кудись іде, і звичайний запит браузер обриває.
//
// Нічого не кидає й нічого не показує: людині від повідомлення «не вдалося
// надіслати повідомлення про помилку» не легшає.

import { getBreadcrumbs } from "./breadcrumbs";
import { clientConfig } from "./config";
import { getReportIds } from "./ids";

const SAME_ERROR_MS = 60_000;
const PER_PAGE_MAX = 10;

const recent = new Map<string, number>();
let sent = 0;

export interface ReportInput {
  event: string;
  message: string;
  detail?: unknown;
  level?: "error" | "warn";
}

export const reportError = (input: ReportInput): void => {
  if (typeof window === "undefined") return;
  if (sent >= PER_PAGE_MAX) return;
  // Одна й та сама помилка в циклі шле сотні однакових звітів, а нового вони не кажуть.
  const key = `${input.event}|${input.message}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < SAME_ERROR_MS) return;
  recent.set(key, now);
  sent++;

  void fetch(clientConfig().reportUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ ...input, route: window.location.pathname, breadcrumbs: getBreadcrumbs(), ...getReportIds() }),
  }).catch(() => {});
};

/** Лише для тестів. */
export const resetReportsForTests = (): void => {
  recent.clear();
  sent = 0;
};
