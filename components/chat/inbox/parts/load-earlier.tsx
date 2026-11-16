// components/chat/inbox/parts/load-earlier.tsx
//
// «Показати раніше» над стрічкою: є лише коли на сервері лишились старіші повідомлення. Під час запиту кнопка
// вимкнена й каже про це, при помилці над нею рядок з причиною, а кнопка лишається для нової спроби.

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export namespace LoadEarlierTypes {
  export type Props = {
    state: "idle" | "loading" | "error";
    onLoad: () => void;
  };
}

export const LoadEarlier = ({ state, onLoad }: LoadEarlierTypes.Props) => (
  <div className="flex flex-col items-center gap-1 py-2">
    {state === "error" && (
      <p className="dm-warn" role="alert">
        Не вдалося завантажити старіші повідомлення.
      </p>
    )}
    <Button variant="link" className="inline-flex min-h-11 items-center gap-2 text-sm" disabled={state === "loading"} aria-busy={state === "loading" || undefined} onClick={onLoad}>
      {state === "loading" && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
      {state === "loading" ? "Завантажуємо…" : state === "error" ? "Спробувати ще раз" : "Показати раніше"}
    </Button>
  </div>
);
