// Результат, який виконавець додав, коли здавав етап: бачить замовник при прийманні, і модератор.
// Посилання чуже, тому відкривається в новій вкладці з rel="noopener noreferrer".

import type { StageDelivery } from "@/lib/deals/types";

export const DeliveryNote = ({ delivery }: { delivery: StageDelivery | undefined }) => {
  if (!delivery) return null;
  return (
    <div className="deal-box">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Результат від виконавця</p>
      {delivery.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-ink">{delivery.text}</p>}
      {delivery.link && (
        <a href={delivery.link} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm underline">
          {delivery.link}
        </a>
      )}
    </div>
  );
};
