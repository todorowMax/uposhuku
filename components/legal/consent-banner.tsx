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
      observer.observe(html, {
        attributes: true,
        attributeFilter: ["data-map-ready"],
      });
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
    if (value === "granted")
      track(EVENTS.consentChosen, { choice: value, from: "banner" });
  };

  return (
    <aside
      role="region"
      aria-label="Статистика використання"
      className="consent-banner glass-panel"
    >
      <div className="consent-body">
        <Cookie />
        <p>
          Рахуємо, як користуються Findlyfy, щоб робити його кращим. Без реклами
          й сторонніх сервісів.{" "}
          <Link href="/legal/privacy#statistics" className="legal-link">
            Детальніше
          </Link>
        </p>
      </div>
      <div className="consent-actions">
        <button
          type="button"
          onClick={() => choose("granted")}
          className="auth-primary auth-secondary px-4"
          style={{ border: 0 }}
        >
          Добре
        </button>
        <button
          type="button"
          onClick={() => choose("denied")}
          className="auth-secondary px-4"
        >
          Не треба
        </button>
      </div>
    </aside>
  );
}

/** Печиво з відкушеним краєм: пласка ілюстрація, без залежностей. */
function Cookie() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="consent-cookie">
      <path
        d="M24 3c-.6 3.6 1.7 6.6 5 7.4 1.6 3.4 5.2 4.9 8.4 3.9 1.4 3.6 4.6 5.5 7.9 5.2.5 1.2.7 2.6.7 4C46 37 36.2 45 24 45S2 37 2 24 11.8 3 24 3z"
        fill="#e9b872"
      />
      <path
        d="M24 3c-.6 3.6 1.7 6.6 5 7.4 1.6 3.4 5.2 4.9 8.4 3.9 1.4 3.6 4.6 5.5 7.9 5.2"
        fill="none"
        stroke="#c98f44"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <g fill="#6b3f22">
        <ellipse cx="15" cy="17" rx="2.6" ry="2.2" />
        <ellipse cx="26" cy="23" rx="2.4" ry="2" />
        <ellipse cx="14" cy="30" rx="2.2" ry="2.6" />
        <ellipse cx="30" cy="35" rx="2.6" ry="2.2" />
        <ellipse cx="37" cy="26" rx="1.8" ry="1.6" />
        <ellipse cx="22" cy="38" rx="1.6" ry="1.4" />
      </g>
      <path
        d="M10 24c0-5 3-9 7-11"
        fill="none"
        stroke="#f6d7a3"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".8"
      />
    </svg>
  );
}
