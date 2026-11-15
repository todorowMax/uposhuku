"use client";

import Link from "next/link";
import {
  useRespondState,
  type RespondStateTypes,
} from "@/components/request-page/use-respond-state";
import { deepLinkNext } from "@/lib/map/deep-link";

export namespace RespondActionTypes {
  export type Props = { requestId: string };
}

const HINTS: Record<RespondStateTypes.State, string> = {
  unknown: "",
  performer: "",
  guest:
    "Відгукнутися можуть виконавці з профілем. Увійдіть, а якщо профілю ще немає, створіть його: після цього ви повернетеся до цього запиту.",
  "no-profile":
    "Відгукнутися можуть виконавці з опублікованим профілем. Створіть його, і ми повернемо вас до цього запиту.",
};

const LABELS: Record<RespondStateTypes.State, string> = {
  unknown: "Відгукнутися",
  performer: "Відгукнутися",
  guest: "Увійти й відгукнутися",
  "no-profile": "Стати виконавцем і відгукнутися",
};

/**
 * Одна головна дія сторінки запиту. Завжди посилання на `/?open=request:<id>`: його приймає DeepLinkSync на карті
 * (виконавцю відкриває запит у стрічці, гостя веде у вхід, увійшовшого без профілю в редактор профілю й повертає до запиту).
 * Другого шляху входу тут немає; без JS посилання теж працює.
 */
export const RespondAction = ({ requestId }: RespondActionTypes.Props) => {
  const state = useRespondState();
  return (
    <div className="grid gap-3">
      {/* Область вже на місці, коли текст з'являється: його озвучить читач екрана. */}
      <p role="status" className="text-sm leading-relaxed text-ink-muted">
        {HINTS[state]}
      </p>
      <Link
        href={deepLinkNext(`request:${requestId}`)}
        prefetch={false}
        className="auth-primary w-full px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
      >
        {LABELS[state]}
      </Link>
    </div>
  );
};
