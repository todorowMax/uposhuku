"use client";

import { useEffect } from "react";
import { ProblemPage } from "@/components/problem-page";
import { reportError } from "@/kit/telemetry/client";

/**
 * Екран падіння. Повтор має сенс: мережа моргнула, сервіс не відповів,
 * з другої спроби часто виходить.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // У консоль, а не на екран: людині це нічого не пояснює.
    console.error(error);
    // `digest`: ключ, за яким Next зв'язує цей екран із записом на сервері
    // (там текст помилки в проді прихований навмисно).
    reportError({ event: "render_error", message: error.message, detail: { digest: error.digest ?? null, stack: error.stack ?? null } });
  }, [error]);

  return (
    <ProblemPage
      title="Щось зламалося"
      hint="Ми вже знаємо про це й розбираємося. Спробуйте ще раз, а якщо не вийде, поверніться на карту."
      action={
        <>
          <button type="button" onClick={reset} className="auth-primary auth-secondary px-5" style={{ border: 0 }}>
            Спробувати ще раз
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload resets the client tree after a render crash */}
          <a href="/" className="auth-secondary px-5">
            На карту
          </a>
        </>
      }
    />
  );
}
