"use client";

import { useEffect, useState } from "react";
import { getConsent, gpcEnabled, onConsentChange, writeConsent, type Consent } from "@/kit/telemetry/client";
import { EVENTS, track } from "@/lib/telemetry/track";

const TEXT: Record<Consent, string> = {
  granted: "Статистика ввімкнена: ми рахуємо дії з ідентифікатором цього пристрою.",
  unknown: "Ви ще не відповіли: ми рахуємо дії без ідентифікатора пристрою.",
  denied: "Статистика вимкнена: дії не рахуються.",
};

/** Змінити вибір щодо статистики прямо на сторінці політики: гість теж має таку змогу. */
export function ConsentControls() {
  const [consent, setConsent] = useState<Consent>("unknown");
  const [gpc, setGpc] = useState(false);

  useEffect(() => {
    setConsent(getConsent());
    setGpc(gpcEnabled());
    return onConsentChange(setConsent);
  }, []);

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    if (value === "granted") track(EVENTS.consentChosen, { choice: value, from: "privacy" });
  };

  return (
    <div className="grid gap-3">
      <p role="status">{TEXT[consent]}</p>
      {gpc && consent === "denied" && <p>Ваш браузер передає сигнал Global Privacy Control, тому ми не рахуємо статистику, доки ви самі не натиснете «Увімкнути».</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => choose("granted")} disabled={consent === "granted"} className="auth-primary auth-secondary px-5" style={{ border: 0 }}>
          Увімкнути статистику
        </button>
        <button type="button" onClick={() => choose("denied")} disabled={consent === "denied"} className="auth-secondary px-5">
          Вимкнути
        </button>
      </div>
    </div>
  );
}
