"use client";

// components/deals/qr-image.tsx
//
// QR-код з посилання. Тиха зона в 4 модулі, темне на світлому (токени в .deal-qr). Поки код будується,
// стоїть заглушка того ж розміру, щоб картка не стрибала.

import { useQrPath } from "./use-qr-path";

const QUIET = 4;

export const QrImage = ({ value, label }: { value: string; label: string }) => {
  const qr = useQrPath(value);
  if (!qr) return <div className="deal-qr" aria-hidden />;
  const full = qr.size + QUIET * 2;
  return (
    <svg className="deal-qr" viewBox={`${-QUIET} ${-QUIET} ${full} ${full}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={qr.d} fill="currentColor" />
    </svg>
  );
};
