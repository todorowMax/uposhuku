"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRenewRequest } from "@/components/requests/use-request-prompts";
import type { PublishedRequest } from "@/lib/requests/types";

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" });

export namespace RequestPromptsTypes {
  export type RenewProps = { request: Pick<PublishedRequest, "id" | "renewalDeadline">; closing: boolean; onClose: () => void };
  export type CloseProps = { onClose: () => void; closing: boolean };
}

/**
 * «Ще актуально?» над панеллю запиту: запит прожив 14 днів, без відповіді він закриється сам (його можна відновити протягом 7 днів).
 * «Так, ще актуально» нікому нічого не шле й лише відкладає строк. Блок є, лише поки питання не отримало відповіді.
 */
export const RenewPrompt = ({ request, closing, onClose }: RequestPromptsTypes.RenewProps) => {
  const { renewing, error, renew } = useRenewRequest();
  if (request.renewalDeadline === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2" role="group" aria-label="Ще актуально?">
      <p className="min-w-0 flex-1 text-sm text-ink">Ще актуально? Без відповіді запит закриється {DATE.format(Date.parse(request.renewalDeadline))}.</p>
      <Button variant="offer" onClick={() => void renew(request.id)} disabled={renewing || closing}>
        Так, ще актуально
      </Button>
      <Button variant="quiet" onClick={onClose} disabled={renewing || closing}>
        Закрити
      </Button>
      {error && <p role="alert" className="auth-error w-full">{error}</p>}
    </div>
  );
};

/** Угоду за запитом прийнято: питаємо, чи закривати запит. «Ще ні» ховає блок до перезавантаження. */
export const ClosePrompt = ({ onClose, closing }: RequestPromptsTypes.CloseProps) => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-2" role="group" aria-label="Закрити запит?">
      <p className="min-w-0 flex-1 text-sm text-ink">Угоду прийнято. Закрити запит?</p>
      <Button variant="offer" onClick={onClose} disabled={closing}>
        Закрити запит
      </Button>
      <Button variant="quiet" onClick={() => setDismissed(true)}>
        Ще ні
      </Button>
    </div>
  );
};
