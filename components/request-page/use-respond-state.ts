"use client";

// components/request-page/use-respond-state.ts
//
// Хто дивиться на сторінку запиту: гість, увійшов без опублікованого профілю виконавця чи виконавець. Два легкі звернення
// (/api/auth/me, потім /api/profile для того, хто увійшов), без карти, сховищ і панелей застосунку: гість не отримує 401
// в консолі. Поки відповіді немає, стан unknown: кнопка вже працює як посилання.

import { useEffect, useState } from "react";

export namespace RespondStateTypes {
  export type State = "unknown" | "guest" | "no-profile" | "performer";
}

const readJson = async <T,>(url: string, signal: AbortSignal): Promise<T | null> => {
  const response = await fetch(url, { cache: "no-store", signal });
  return response.ok ? ((await response.json().catch(() => null)) as T | null) : null;
};

export const useRespondState = (): RespondStateTypes.State => {
  const [state, setState] = useState<RespondStateTypes.State>("unknown");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const me = await readJson<{ user: unknown }>("/api/auth/me", controller.signal);
      if (!me) return;
      if (!me.user) return setState("guest");
      const data = await readJson<{ profile?: { published?: boolean } | null }>("/api/profile", controller.signal);
      if (data) setState(data.profile?.published ? "performer" : "no-profile");
    };
    load().catch(() => undefined);
    return () => controller.abort();
  }, []);

  return state;
};
