"use client";

// kit/telemetry/client/error-reporter.tsx
//
// Ловить те, що не спіймав ніхто. Дві події покривають майже все: `error`
// (винятки під час виконання) і `unhandledrejection` (обіцянки, у яких
// ніхто не перехопив відмову: майже кожен наш запит це `fetch`).
//
// Помилки самих запитів зазвичай обробляються на місці. Сюди приходить те,
// про що ми не подумали, і саме тому воно найцінніше.

import { useEffect } from "react";
import { reportError } from "./report-error";

/** Шум, який нічого не каже про наш код. */
const NOISE: (string | RegExp)[] = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /^AbortError/i,
  /The user aborted a request/i,
  /Non-Error promise rejection captured/i,
];
const FOREIGN_SOURCE = /^(chrome|moz|safari|safari-web)-extension:\/\//i;

const matches = (text: string, list: (string | RegExp)[]) => list.some((rule) => (typeof rule === "string" ? text.includes(rule) : rule.test(text)));

export function ErrorReporter({ ignore = [] }: { ignore?: (string | RegExp)[] }) {
  useEffect(() => {
    const skip = [...NOISE, ...ignore];

    const onError = (event: ErrorEvent) => {
      if (matches(event.message ?? "", skip)) return;
      // Скрипти розширень браузера чи сторонні без стека від нас не залежать.
      if (event.filename && FOREIGN_SOURCE.test(event.filename)) return;
      if (event.error instanceof Error && event.error.stack && FOREIGN_SOURCE.test(event.error.stack.split("\n")[1]?.trim().replace(/^at\s+/, "") ?? "")) return;
      reportError({
        event: "unhandled_error",
        message: event.message,
        detail: { source: event.filename, line: event.lineno, column: event.colno, stack: event.error instanceof Error ? event.error.stack : null },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason).slice(0, 200);
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (matches(message, skip) || (reason instanceof Error && matches(`${reason.name}: ${reason.message}`, skip))) return;
      reportError({ event: "unhandled_rejection", message, detail: { stack: reason instanceof Error ? reason.stack : null } });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [ignore]);

  return null;
}
