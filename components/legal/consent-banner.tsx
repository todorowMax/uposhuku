"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shouldAskConsent, writeConsent } from "@/kit/telemetry/client";
import { EVENTS, track } from "@/lib/telemetry/track";

/** Через скільки після першого кадру карти питаємо, щоб не заважати першому враженню. */
const DELAY_MS = 3000;
/** Якщо карта так і не намалювалась (немає WebGL), питаємо все одно. */
const GIVE_UP_MS = 9000;

/**
 * Запит згоди на статистику. Маленька картка внизу ліворуч, на телефоні над
 * нижніми кнопками. Не перекриває поле запиту. Питаємо один раз; не питаємо,
 * якщо браузер передає Global Privacy Control (це вже відмова).
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldAskConsent()) return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(true), DELAY_MS);
    };
    const html = document.documentElement;
    let observer: MutationObserver | undefined;
    if (html.hasAttribute("data-map-ready")) arm();
    else {
      observer = new MutationObserver(() => {
        if (html.hasAttribute("data-map-ready")) {
          observer?.disconnect();
          arm();
        }
      });
      observer.observe(html, { attributes: true, attributeFilter: ["data-map-ready"] });
      timer = window.setTimeout(() => setVisible(true), GIVE_UP_MS);
    }
    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setVisible(false);
    if (value === "granted") track(EVENTS.consentChosen, { choice: value, from: "banner" });
  };

  return (
    <aside role="region" aria-label="Статистика використання" className="consent-banner glass-panel">
      <p>
        Рахуємо, як користуються Findlyfy, щоб робити його кращим. Без реклами й сторонніх сервісів.{" "}
        <Link href="/legal/privacy#statistics" className="legal-link">
          Детальніше
        </Link>
      </p>
      <div className="consent-actions">
        <button type="button" onClick={() => choose("granted")} className="auth-primary auth-secondary px-4" style={{ border: 0 }}>
          Добре
        </button>
        <button type="button" onClick={() => choose("denied")} className="auth-secondary px-4">
          Не треба
        </button>
      </div>
    </aside>
  );
}
