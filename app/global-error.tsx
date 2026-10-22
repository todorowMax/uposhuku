"use client";

import { useEffect } from "react";
import { ProblemPage } from "@/components/problem-page";
import { reportError } from "@/kit/telemetry/client";
import "./globals.css";

/**
 * Остання межа: падає сам кореневий layout. Тут немає ні шрифтів, ні
 * провайдерів, тому свої <html> і <body> та мінімум розмітки.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportError({ event: "render_error", message: error.message, detail: { digest: error.digest ?? null, stack: error.stack ?? null, boundary: "global" } });
  }, [error]);

  return (
    <html lang="uk">
      <body className="min-h-dvh antialiased">
        <ProblemPage
          title="Щось зламалося"
          hint="Застосунок не зміг завантажитись. Ми вже знаємо про це. Спробуйте ще раз."
          action={
            <button type="button" onClick={reset} className="auth-primary auth-secondary px-5" style={{ border: 0 }}>
              Спробувати ще раз
            </button>
          }
        />
      </body>
    </html>
  );
}
